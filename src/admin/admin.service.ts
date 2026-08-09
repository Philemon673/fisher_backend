import { Injectable } from '@nestjs/common';
import { ConversationStatus, OrderStatus, StockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * A single aggregated snapshot for the admin dashboard's landing view.
     * Deliberately reads directly via PrismaService rather than going
     * through OrdersService/ProductsService/etc. — those services return
     * full entities with relations included, which would be wasteful for
     * numbers that only need count()/aggregate(). This is the one place
     * in the app where bypassing a sibling module's service for a raw
     * Prisma query is the right call, since nothing here mutates data.
     */
    async getDashboardSummary() {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [
            ordersToday,
            pendingOrders,
            monthlyRevenue,
            totalCustomers,
            lowStockProducts,
            outOfStockProducts,
            openConversations,
            unclaimedConversations,
        ] = await this.prisma.$transaction([
            this.prisma.order.count({
                where: { createdAt: { gte: startOfToday } },
            }),
            this.prisma.order.count({
                where: { status: OrderStatus.PENDING },
            }),
            this.prisma.order.aggregate({
                where: {
                    createdAt: { gte: startOfMonth },
                    status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
                },
                _sum: { total: true },
            }),
            this.prisma.user.count({
                where: { role: 'CUSTOMER', isActive: true, deletedAt: null },
            }),
            this.prisma.product.count({
                where: {
                    deletedAt: null,
                    stockQuantity: { lte: 5, gt: 0 }, // threshold — adjust to taste
                },
            }),
            this.prisma.product.count({
                where: { deletedAt: null, stockStatus: StockStatus.OUT_OF_STOCK },
            }),
            this.prisma.conversation.count({
                where: { status: ConversationStatus.OPEN },
            }),
            this.prisma.conversation.count({
                where: { status: ConversationStatus.OPEN, adminId: null },
            }),
        ]);

        return {
            orders: {
                today: ordersToday,
                pending: pendingOrders,
            },
            revenue: {
                thisMonth: monthlyRevenue._sum.total ?? 0,
            },
            customers: {
                totalActive: totalCustomers,
            },
            inventory: {
                lowStock: lowStockProducts,
                outOfStock: outOfStockProducts,
            },
            support: {
                open: openConversations,
                unclaimed: unclaimedConversations,
            },
        };
    }
}