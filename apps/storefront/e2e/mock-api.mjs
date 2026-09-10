import { createServer } from 'node:http';

const CATEGORY_ID = '0193f1a0-0000-7000-8000-000000000001';
const PRODUCT_ID = '0193f1a0-0000-7000-8000-000000000002';
const OFFER_ID = '0193f1a0-0000-7000-8000-000000000003';
const ORDER_ID = '0193f1a0-0000-7000-8000-000000000004';
const TRACKING_TOKEN = '0193f1a0-0000-7000-8000-000000000005';

const catalog = {
  store: {
    slug: 'cabanhas-bbq',
    name: 'Cabanhas BBQ',
    themeKey: 'brasa',
    timezone: 'America/Sao_Paulo',
    publicDescription: 'Churrasco no capricho.',
    logoImageUrl: null,
    coverImageUrl: null,
    addressText: 'Novo Hamburgo, RS',
    phone: null,
    whatsappNumber: null,
    minOrderCents: 0,
    isOpenNow: true,
    nextOpensAt: null,
    availablePaymentMethods: ['pix'],
    reviewsSummary: { average: null, count: 0 },
  },
  categories: [
    {
      id: CATEGORY_ID,
      name: 'Combos',
      products: [
        {
          id: PRODUCT_ID,
          offerId: OFFER_ID,
          name: 'Combo Brasa',
          description: 'Carne, acompanhamento e molho da casa.',
          basePriceCents: 2890,
          imageUrl: null,
          images: [],
          available: true,
          modifierGroups: [],
        },
      ],
    },
  ],
  otpChannel: 'sms',
  guestCheckout: false,
};

const checkoutReview = {
  items: [
    {
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
      name: 'Combo Brasa',
      available: true,
      unitBasePriceCents: 2890,
      modifiers: [],
      quantity: 1,
      notes: null,
      lineTotalCents: 2890,
      priceChanged: false,
    },
  ],
  subtotalCents: 2890,
  withinZone: true,
  deliveryFeeCents: 0,
  etaMinMinutes: null,
  etaMaxMinutes: null,
  isOpenNow: true,
  nextOpensAt: null,
  minOrderCents: 0,
  couponCode: null,
  couponValid: false,
  discountCents: 0,
  promotionDiscountCents: 0,
  scheduledFor: null,
  scheduledForValid: true,
  totalCents: 2890,
  hasUnfavorableDivergence: false,
  canSubmit: true,
};

const order = {
  orderId: ORDER_ID,
  trackingToken: TRACKING_TOKEN,
  status: 'received',
  paymentStatus: 'aguardando_confirmacao',
  totalCents: 2890,
  discountCents: 0,
  promotionDiscountCents: 0,
  couponCode: null,
  cashbackUsedCents: 0,
  scheduledFor: null,
  fulfillmentType: 'pickup',
  fulfillmentDeadlineAt: '2026-09-09T19:30:00.000Z',
  paymentMethod: 'pix',
  pix: {
    payload: '00020126360014BR.GOV.BCB.PIX0114+5551999999999520400005303986540528.905802BR5920CABANHAS BBQ LTDA6009SAO PAULO62070503***6304ABCD',
    key: '+5551999999999',
    keyType: 'phone',
  },
};

const tracking = {
  orderId: ORDER_ID,
  status: 'received',
  fulfillmentType: 'pickup',
  fulfillmentDeadlineAt: '2026-09-09T19:30:00.000Z',
  totalCents: 2890,
  canceledReason: null,
  items: [{ name: 'Combo Brasa', quantity: 1 }],
  timeline: [{ status: 'received', at: '2026-09-09T19:00:00.000Z' }],
};

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:3334');
  if (url.pathname === '/health') return json(response, 200, { ok: true });
  if (request.method === 'GET' && url.pathname === '/v1/store/cabanhas-bbq') {
    return json(response, 200, catalog);
  }
  if (request.method === 'POST' && url.pathname === '/v1/store/cabanhas-bbq/checkout/revalidate') {
    return json(response, 200, checkoutReview);
  }
  if (request.method === 'POST' && url.pathname === '/v1/store/cabanhas-bbq/auth/otp/request') {
    response.writeHead(202, { 'cache-control': 'no-store' });
    return response.end();
  }
  if (request.method === 'POST' && url.pathname === '/v1/store/cabanhas-bbq/auth/otp/verify') {
    return json(response, 200, {
      accessToken: 'customer-session-token-123456',
      user: { id: '0193f1a0-0000-7000-8000-000000000006' },
    });
  }
  if (request.method === 'POST' && url.pathname === '/v1/store/cabanhas-bbq/checkout/orders') {
    if (request.headers.authorization !== 'Bearer customer-session-token-123456' || request.headers.cookie) {
      return json(response, 401, { error: 'unauthorized' });
    }
    return json(response, 201, order);
  }
  if (request.method === 'GET' && url.pathname === `/v1/store/cabanhas-bbq/track/${TRACKING_TOKEN}`) {
    return json(response, 200, tracking);
  }
  return json(response, 404, { error: 'not_found' });
});

server.listen(3334, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
