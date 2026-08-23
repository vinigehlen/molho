import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { CouponsController } from './coupons.controller';
import { CouponService } from './coupon.service';
import { PrismaCouponRepository } from './coupon.repository';
import { COUPON_SERVICE } from './coupon.tokens';

export { COUPON_SERVICE };

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [CouponsController],
  providers: [
    {
      provide: COUPON_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): CouponService =>
        new CouponService(new PrismaCouponRepository(requestContext)),
    },
  ],
  exports: [COUPON_SERVICE],
})
export class CouponsModule {}
