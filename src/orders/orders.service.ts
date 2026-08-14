import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, StockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notification/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

const SHIPPING_FEE = 0; // flat for now — swap for real shipping logic later

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) { }

  /**
   * The checkout flow. Everything happens inside a single interactive
   * transaction: if stock validation fails on item 3 of 5, or the order
   * write fails, or the cart-clear fails — NOTHING commits. The customer
   * never ends up in a state where stock was decremented but no order
   * exists, or an order exists but the cart wasn't cleared.
   */
  async checkout(userId: string, dto: CreateOrderDto) {
    if (dto.addressId) {
      await this.ensureAddressOwnership(userId, dto.addressId);
    }

    return this.prisma.$transaction(async (tx) => {
      const cartItems = await tx.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });

      if (cartItems.length === 0) {
        throw new BadRequestException('Cannot checkout with an empty cart');
      }

      // Re-validate stock at the moment of checkout — the cart may have
      // been sitting for a while, and another customer could have bought
      // the last units since this cart item was added.
      for (const item of cartItems) {
        this.assertPurchasable(item.product, item.quantity);
      }

      const subtotal = cartItems.reduce(
        (sum, item) => sum + Number(item.product.price) * item.quantity,
        0,
      );
      const total = subtotal + SHIPPING_FEE;

      const order = await tx.order.create({
        data: {
          orderNumber: this.generateOrderNumber(),
          userId,
          addressId: dto.addressId,
          status: OrderStatus.PENDING,
          subtotal,
          shippingFee: SHIPPING_FEE,
          total,
          items: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              productName: item.product.name, // snapshot — survives future rename/delete
              quantity: item.quantity,
              unitPrice: item.product.price, // snapshot — survives future price change
            })),
          },
        },
        include: this.orderInclude(),
      });

      // Decrement stock for every purchased item, flipping status to
      // OUT_OF_STOCK if that exhausts it.
      for (const item of cartItems) {
        const remaining = item.product.stockQuantity - item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: remaining,
            ...(remaining <= 0 && { stockStatus: StockStatus.OUT_OF_STOCK }),
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { userId } });

      return order;
    }).then(async (order) => {
      // Deliberately outside the $transaction callback — notifications
      // are a side effect, not part of the atomic write. If the push
      // fails, the order still stands; NotificationsService already
      // swallows its own errors and just logs them.
      await this.notificationsService.notifyUser(userId, {
        title: 'Order placed',
        body: `Your order ${order.orderNumber} has been received.`,
        data: { orderId: order.id, type: 'order_placed' },
      });

      await this.notificationsService.notifyAdmins({
        title: 'New order',
        body: `Order ${order.orderNumber} — ${order.total} ${order.currency}`,
        data: { orderId: order.id, type: 'new_order' },
      });

      // Send detailed Order Email to Admin
      await this.mailService.sendOrderNotificationToAdmin({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        user: {
          name: (order.user as any)?.name || undefined,
          email: (order.user as any)?.email || '',
        },
        shippingInfo: dto.shippingInfo,
        paymentMethod: dto.paymentMethod,
        items: order.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shippingFee),
        total: Number(order.total),
      });

      return order;
    });
  }

  async findAllForUser(userId: string, query: QueryOrdersDto) {
    return this.paginate({ userId, ...(query.status && { status: query.status }) }, query);
  }

  async findOneForUser(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude(),
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Admin view — includes user info on every order, matching the
   * original requirement: "admin can see orders and who placed them."
   */
  async findAllForAdmin(query: QueryOrdersDto) {
    return this.paginate(query.status ? { status: query.status } : {}, query, true);
  }

  async findOneForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude(true),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertValidTransition(order.status, dto.status);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
      include: this.orderInclude(true),
    });

    await this.notificationsService.notifyUser(order.userId, {
      title: 'Order update',
      body: `Your order ${order.orderNumber} is now ${dto.status.toLowerCase()}.`,
      data: { orderId: order.id, type: 'order_status_changed' },
    });

    return updated;
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async paginate(
    where: Prisma.OrderWhereInput,
    query: QueryOrdersDto,
    withUser = false,
  ) {
    const { page, limit } = query;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: this.orderInclude(withUser),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private assertPurchasable(
    product: { name: string; stockStatus: StockStatus; stockQuantity: number },
    requestedQuantity: number,
  ): void {
    if (product.stockStatus !== StockStatus.IN_STOCK) {
      throw new BadRequestException(
        `"${product.name}" is no longer available for purchase`,
      );
    }

    if (requestedQuantity > product.stockQuantity) {
      throw new BadRequestException(
        `Only ${product.stockQuantity} unit(s) of "${product.name}" available — please update your cart`,
      );
    }
  }

  /**
   * Blocks nonsensical admin status changes, e.g. moving a CANCELLED
   * order back to PENDING, or skipping straight from PENDING to
   * DELIVERED without ever being SHIPPED. Adjust the map if your
   * actual fulfillment process allows different jumps.
   */
  private assertValidTransition(current: OrderStatus, next: OrderStatus): void {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      CONFIRMED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      SHIPPED: [OrderStatus.DELIVERED],
      DELIVERED: [OrderStatus.REFUNDED],
      CANCELLED: [],
      REFUNDED: [],
    };

    if (current === next) return; // no-op update, allow it

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Cannot change order status from ${current} to ${next}`,
      );
    }
  }

  private async ensureAddressOwnership(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }
  }

  private generateOrderNumber(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ORD-${datePart}-${randomPart}`;
  }

  private orderInclude(withUser = false) {
    return {
      items: true,
      address: true,
      ...(withUser && {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      }),
    } satisfies Prisma.OrderInclude;
  }
}