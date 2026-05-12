import React, { useMemo, useState } from 'react';

/**
 * Design tokens (mirror Tailwind-friendly palette)
 * Requires Tailwind CSS in your build (e.g. content: ["./RestaurantPage.jsx"]).
 */
const COLORS = `
  :root {
    --black: #000000;
    --white: #FFFFFF;
    --gold: #C8941A;
    --gold-light: #F5E6C0;
    --green: #05944F;
    --red: #EF4444;
    --gray-bg: #F6F6F6;
    --gray-border: #E5E5E5;
    --text-muted: #6B6B6B;
  }
`;

const HERO_IMG =
  'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800&q=80';

const ORDER_AGAIN = [
  {
    id: 'oa1',
    name: 'Italian B.M.T.®',
    price: 11.49,
    img: 'https://picsum.photos/seed/sub1/300/200',
    desc: 'Salami, ham, pepperoni, veggies',
  },
  {
    id: 'oa2',
    name: 'Steak & Cheese',
    price: 12.99,
    img: 'https://picsum.photos/seed/sub2/300/200',
    desc: 'Steak, cheese, peppers & onions',
  },
  {
    id: 'oa3',
    name: 'Turkey Breast',
    price: 9.99,
    img: 'https://picsum.photos/seed/sub3/300/200',
    desc: 'Lean turkey, fresh toppings',
  },
];

const BOGO_ITEMS = [
  { id: 'b1', name: 'Footlong Sub Combo', price: 14.99, img: 'https://picsum.photos/seed/bogo1/300/200' },
  { id: 'b2', name: 'Chicken Teriyaki', price: 11.99, img: 'https://picsum.photos/seed/bogo2/300/200' },
  { id: 'b3', name: 'Meatball Marinara', price: 10.49, img: 'https://picsum.photos/seed/bogo3/300/200' },
  { id: 'b4', name: 'Veggie Delite®', price: 8.99, img: 'https://picsum.photos/seed/bogo4/300/200' },
];

const DRINKS = [
  { id: 'd1', name: 'bubly pop berry', price: 2.79, img: 'https://picsum.photos/seed/drink1/300/200' },
  { id: 'd2', name: 'bubly pop lemon lime', price: 2.79, img: 'https://picsum.photos/seed/drink2/300/200' },
  { id: 'd3', name: 'Dole Orange Juice', price: 3.49, img: 'https://picsum.photos/seed/drink3/300/200' },
  { id: 'd4', name: 'Dole Apple Juice', price: 3.49, img: 'https://picsum.photos/seed/drink4/300/200' },
];

const TABS = ['Salads', 'Drinks', 'Snacks & Sides', 'More to explore'];

const BREAD_OPTIONS = [
  { id: 'italian', label: 'Italian', icon: '🥖' },
  { id: 'wheat', label: '9-Grain Wheat', icon: '🌾' },
  { id: 'herb', label: 'Italian Herbs & Cheese', icon: '🧀' },
  { id: 'wrap', label: 'Spinach Wrap', icon: '🌯' },
];

const PREVIOUS_ORDERS = [
  { id: 'p1', name: 'Turkey Cali', price: 12.49, img: 'https://picsum.photos/seed/prev1/120/120' },
  { id: 'p2', name: 'Cold Cut', price: 10.99, img: 'https://picsum.photos/seed/prev2/120/120' },
  { id: 'p3', name: 'Tuna', price: 9.99, img: 'https://picsum.photos/seed/prev3/120/120' },
];

function IconBackDark() {
  return (
    <svg className="h-6 w-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg className="h-6 w-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="h-5 w-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg className="h-5 w-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className="h-5 w-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg className="h-8 w-8 text-[#6B6B6B]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg className="h-5 w-5 text-[#C8941A]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 3h14v2H5V3zm0 4h14v6a5 5 0 01-5 5h-4a5 5 0 01-5-5V7zm4 16h6v2H9v-2z" />
    </svg>
  );
}

function IconUberOne() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#F5E6C0] text-[10px] font-bold text-[#C8941A]">
      1
    </span>
  );
}

export default function RestaurantPage() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [deliveryMode, setDeliveryMode] = useState('delivery');
  const [deliverySpeed, setDeliverySpeed] = useState('priority');
  const [cartItems, setCartItems] = useState([]);
  const [currentScreen, setCurrentScreen] = useState('restaurant');
  const [breadChoice, setBreadChoice] = useState(BREAD_OPTIONS[0].id);
  const [modalQty, setModalQty] = useState(2);

  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);
  const cartSubtotal = useMemo(() => cartItems.reduce((s, i) => s + i.price * i.qty, 0), [cartItems]);
  const showCartBar = cartCount > 0 && currentScreen === 'restaurant';

  function addToCart(item, qty = 1) {
    setCartItems((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  }

  function incCart(id) {
    setCartItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x)));
  }

  function decCart(id) {
    setCartItems((prev) =>
      prev
        .map((x) => (x.id === id ? { ...x, qty: x.qty - 1 } : x))
        .filter((x) => x.qty > 0),
    );
  }

  function openItem(item) {
    setSelectedItem(item);
    setBreadChoice(BREAD_OPTIONS[0].id);
    setModalQty(2);
  }

  const modalLineTotal = selectedItem ? selectedItem.price * modalQty : 0;
  const modalStrike = selectedItem ? selectedItem.price * modalQty * 2 : 0;

  if (currentScreen === 'checkout') {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Sora:wght@600;700&display=swap');
          ${COLORS}
        `}</style>
        <div
          className="min-h-screen bg-[#F6F6F6] font-['DM_Sans',sans-serif] text-black antialiased"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <div className="mx-auto max-w-sm bg-[#F6F6F6] pb-36 pt-3">
            <div className="flex items-center gap-3 px-4 pb-2">
              <button
                type="button"
                onClick={() => setCurrentScreen('restaurant')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-[#E5E5E5]"
                aria-label="Back"
              >
                <IconBackDark />
              </button>
              <h1 className="font-['Sora',sans-serif] text-lg font-bold text-black" style={{ fontFamily: "'Sora', sans-serif" }}>
                Checkout
              </h1>
            </div>

            <div className="mt-2 px-4">
              <div className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('delivery')}
                  className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
                    deliveryMode === 'delivery' ? 'bg-black text-white' : 'text-[#6B6B6B]'
                  }`}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('pickup')}
                  className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
                    deliveryMode === 'pickup' ? 'bg-black text-white' : 'text-[#6B6B6B]'
                  }`}
                >
                  Pickup
                </button>
              </div>
            </div>

            <div className="mt-4 px-4">
              <div className="relative h-36 overflow-hidden rounded-2xl bg-[#E5E5E5] shadow-md ring-1 ring-[#E5E5E5]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <IconPin />
                </div>
                <button
                  type="button"
                  className="absolute bottom-3 right-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-md ring-1 ring-[#E5E5E5]"
                >
                  Edit pin
                </button>
              </div>
            </div>

            <div className="mt-4 px-4">
              <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-[#E5E5E5]">
                <p className="text-sm font-semibold text-black">65 Combe Ave, North York, ON M3H 4J5</p>
                <div className="mt-3 flex items-center justify-between border-t border-[#E5E5E5] pt-3">
                  <span className="text-sm text-[#6B6B6B]">Meet at my door</span>
                  <span className="text-xs font-semibold text-[#05944F]">Default</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-[#6B6B6B]">Phone</span>
                  <span className="text-sm font-semibold text-black">(416) 555-0142</span>
                </div>
              </div>
            </div>

            <div className="mt-5 px-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6B6B6B]">Delivery time</p>
              <div className="flex gap-2">
                {[
                  { id: 'priority', title: 'Priority', sub: '8:20–8:30 AM', extra: '+$1.49', hint: 'Direct to you' },
                  { id: 'standard', title: 'Standard', sub: '8:35–8:50 AM', extra: '', hint: '' },
                  { id: 'scheduled', title: 'Schedule', sub: 'Pick time', extra: '', hint: '' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeliverySpeed(opt.id)}
                    className={`flex min-w-0 flex-1 flex-col rounded-2xl border-2 p-3 text-left shadow-sm transition ${
                      deliverySpeed === opt.id ? 'border-black bg-white shadow-md' : 'border-[#E5E5E5] bg-white'
                    }`}
                  >
                    <span className="font-['Sora',sans-serif] text-xs font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                      {opt.title}
                    </span>
                    <span className="mt-1 text-[10px] font-medium text-[#6B6B6B]">{opt.sub}</span>
                    {opt.extra ? (
                      <span className="mt-1 text-[10px] font-bold text-black">{opt.extra}</span>
                    ) : null}
                    {opt.hint ? (
                      <span className="mt-1 text-[9px] font-semibold text-[#05944F]">{opt.hint}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 px-4">
              <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-[#E5E5E5]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-['Sora',sans-serif] text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                      Subway
                    </p>
                    <p className="text-xs text-[#6B6B6B]">{cartCount || 4} items</p>
                  </div>
                  <span className="text-lg text-[#6B6B6B]">›</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#E5E5E5] pt-3">
                  <span className="text-sm font-medium text-black">Send as a gift</span>
                  <div className="h-6 w-11 rounded-full bg-[#E5E5E5] p-0.5">
                    <div className="h-5 w-5 rounded-full bg-white shadow" />
                  </div>
                </div>
                <button type="button" className="mt-3 w-full rounded-xl border border-dashed border-[#E5E5E5] py-2 text-sm font-semibold text-[#6B6B6B]">
                  Add promo code
                </button>
              </div>
            </div>

            <div className="mt-4 px-4">
              <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-[#E5E5E5]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Item Subtotal</span>
                  <span className="font-['Sora',sans-serif] font-semibold" style={{ fontFamily: "'Sora', sans-serif" }}>
                    $46.14
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Promotion</span>
                  <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-bold text-[#EF4444]">-$23.07</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-[#6B6B6B]">
                    Delivery Fee <IconUberOne />
                  </span>
                  <span>
                    <span className="text-[#6B6B6B] line-through">$7.49</span>{' '}
                    <span className="font-['Sora',sans-serif] font-bold text-[#05944F]" style={{ fontFamily: "'Sora', sans-serif" }}>
                      $0.00
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Priority Fee</span>
                  <span className="font-semibold">$1.49</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Taxes</span>
                  <span>
                    <span className="text-[#6B6B6B] line-through">$9.68</span>{' '}
                    <span className="font-semibold">$8.53</span>
                  </span>
                </div>
                <div className="mt-3 flex justify-between border-t border-[#E5E5E5] pt-3">
                  <span className="font-['Sora',sans-serif] text-base font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                    Total
                  </span>
                  <span className="font-['Sora',sans-serif] text-lg font-bold text-[#C8941A]" style={{ fontFamily: "'Sora', sans-serif" }}>
                    $31.40
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 px-4">
              <div className="rounded-2xl border border-[#F5E6C0] bg-[#F5E6C0]/60 p-3 shadow-sm">
                <p className="text-center text-xs font-semibold text-[#6B6B6B]">
                  With Uber One and promotions, you save <span className="font-bold text-[#C8941A]">$31.71</span>
                </p>
              </div>
            </div>

            <div className="mt-4 px-4">
              <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-md ring-1 ring-[#E5E5E5]">
                <div className="flex h-10 w-14 items-center justify-center rounded-md bg-[#1A1F71] text-[10px] font-bold text-white">
                  VISA
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Visa ···· 9706</p>
                  <p className="text-xs text-[#6B6B6B]">Expires 09/27</p>
                </div>
                <span className="text-[#6B6B6B]">›</span>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E5E5E5] bg-white p-4 pb-6">
            <div className="mx-auto max-w-sm">
              <button
                type="button"
                className="w-full rounded-full bg-black py-4 text-center font-['Sora',sans-serif] text-base font-bold text-white shadow-lg transition active:scale-[0.98]"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Sora:wght@600;700&display=swap');
        ${COLORS}
      `}</style>
      <div
        className="min-h-screen bg-[#F6F6F6] pb-44 font-['DM_Sans',sans-serif] text-black antialiased"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="relative mx-auto max-w-sm bg-[#F6F6F6] shadow-xl">
          {/* Hero */}
          <div className="relative h-[220px] w-full overflow-hidden">
            <img src={HERO_IMG} alt="" className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-3">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm"
                aria-label="Back"
              >
                <IconBack />
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm"
                  aria-label="Search"
                >
                  <IconSearch />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm"
                  aria-label="Favorite"
                >
                  <IconHeart />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm"
                  aria-label="More"
                >
                  <IconMore />
                </button>
              </div>
            </div>
            <div className="absolute bottom-[-28px] left-1/2 z-10 flex -translate-x-1/2 justify-center">
              <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-white shadow-xl ring-1 ring-[#E5E5E5]">
                <img
                  src="https://picsum.photos/seed/subwaylogo/160/160"
                  alt="Logo"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Restaurant info */}
          <div className="relative z-0 px-4 pt-10">
            <h2 className="text-center font-['Sora',sans-serif] text-2xl font-bold tracking-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
              Subway
            </h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-[#6B6B6B]">
              <span className="font-semibold text-black">★ 4.7</span>
              <span>(1,240)</span>
              <span>·</span>
              <span className="font-semibold text-black">$0.49 delivery</span>
              <span>·</span>
              <span className="rounded-md bg-[#F5E6C0] px-1.5 py-0.5 text-[10px] font-bold text-[#C8941A]">Uber One</span>
              <span>·</span>
              <span>0.8 mi</span>
            </div>
            <p className="mt-2 text-center text-xs leading-relaxed text-[#6B6B6B]">
              2000 Finch Ave W, North York, ON M3N 1K1
            </p>
            <div className="mt-3 flex justify-center">
              <span className="rounded-full bg-[#05944F] px-3 py-1 text-xs font-bold text-white shadow-sm">
                800+ people reordered
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <div className="flex flex-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('delivery')}
                  className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
                    deliveryMode === 'delivery' ? 'bg-black text-white' : 'text-[#6B6B6B]'
                  }`}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('pickup')}
                  className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
                    deliveryMode === 'pickup' ? 'bg-black text-white' : 'text-[#6B6B6B]'
                  }`}
                >
                  Pickup
                </button>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-bold shadow-sm"
              >
                Group order
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white p-3 shadow-md ring-1 ring-[#E5E5E5]">
                <p className="text-xs font-bold text-black">Free delivery on $15+</p>
                <p className="mt-1 text-[10px] text-[#6B6B6B]">Uber One members</p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-md ring-1 ring-[#E5E5E5]">
                <p className="text-xs font-bold text-black">15 min earliest arrival</p>
                <p className="mt-1 text-[10px] text-[#6B6B6B]">As soon as 8:05 AM</p>
              </div>
            </div>
          </div>

          {/* Order again */}
          <div className="mt-8 px-4">
            <h3 className="font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
              Order Again
            </h3>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ORDER_AGAIN.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="w-[44%] shrink-0 rounded-2xl bg-white p-2 text-left shadow-md ring-1 ring-[#E5E5E5] transition active:scale-[0.98]"
                >
                  <div className="relative overflow-hidden rounded-xl">
                    <img src={item.img} alt="" className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-full bg-[#EF4444] px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                      Buy 1, Get 1 Free
                    </span>
                  </div>
                  <p className="mt-2 font-['Sora',sans-serif] text-sm font-bold leading-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                    {item.name}
                  </p>
                  <p className="mt-1 font-['Sora',sans-serif] text-sm font-bold text-black" style={{ fontFamily: "'Sora', sans-serif" }}>
                    ${item.price.toFixed(2)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#6B6B6B]">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Sticky tabs */}
          <div className="sticky top-0 z-20 mt-6 border-b border-[#E5E5E5] bg-[#F6F6F6]/95 backdrop-blur-md">
            <div className="flex gap-4 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`shrink-0 whitespace-nowrap pb-1 text-sm font-semibold transition ${
                    activeTab === tab ? 'border-b-2 border-black text-black' : 'border-b-2 border-transparent text-[#6B6B6B]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* BOGO section */}
          <div className="mt-6 px-4">
            <div className="mb-3 flex items-center gap-2">
              <IconTrophy />
              <h3 className="font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                Buy 1, Get 1 Free
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BOGO_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="overflow-hidden rounded-2xl bg-white text-left shadow-md ring-1 ring-[#E5E5E5] transition active:scale-[0.98]"
                >
                  <div className="relative">
                    <img src={item.img} alt="" className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute bottom-2 left-2 rounded-full bg-[#EF4444] px-2 py-0.5 text-[8px] font-bold uppercase text-white">
                      Buy 1, get 1 free
                    </span>
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 font-['Sora',sans-serif] text-xs font-bold leading-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                      {item.name}
                    </p>
                    <p className="mt-1 font-['Sora',sans-serif] text-sm font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Drinks */}
          <div className="mt-8 px-4 pb-8">
            <h3 className="font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
              Drinks
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {DRINKS.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-[#E5E5E5]"
                >
                  <button type="button" onClick={() => openItem(item)} className="w-full text-left">
                    <img src={item.img} alt="" className="aspect-square w-full object-cover" />
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-bold capitalize leading-tight">{item.name}</p>
                      <p className="mt-1 font-['Sora',sans-serif] text-sm font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                        ${item.price.toFixed(2)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center justify-end border-t border-[#F6F6F6] px-2 py-2">
                    <button
                      type="button"
                      onClick={() => addToCart(item, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-lg font-light text-white shadow-md transition active:scale-95"
                      aria-label="Add"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal */}
        <div
          className={`fixed inset-0 z-40 transition-opacity duration-300 ${
            selectedItem ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!selectedItem}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setSelectedItem(null)}
            aria-label="Close overlay"
          />
          <div
            className={`absolute bottom-0 left-0 right-0 mx-auto max-h-[92vh] max-w-sm overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out ${
              selectedItem ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            {selectedItem ? (
              <div className="flex max-h-[92vh] flex-col">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#E5E5E5]" />
                <div className="overflow-y-auto pb-28">
                  <img src={selectedItem.img} alt="" className="h-52 w-full object-cover" />
                  <div className="px-4 pt-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-['Sora',sans-serif] text-xl font-bold leading-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                        {selectedItem.name}
                      </h3>
                      <p className="shrink-0 font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                        ${selectedItem.price.toFixed(2)}
                      </p>
                    </div>
                    <span className="mt-2 inline-block rounded-full bg-[#EF4444] px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                      Buy 1, get 1 free
                    </span>
                    <p className="mt-3 text-sm leading-relaxed text-[#6B6B6B]">
                      Toasted bread, premium proteins, crisp veggies, and signature sauces — crafted fresh for you.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#F6F6F6] px-2.5 py-1 text-[10px] font-bold text-black">#1 most liked</span>
                      <span className="rounded-full bg-[#F5E6C0] px-2.5 py-1 text-[10px] font-bold text-[#C8941A]">You liked this</span>
                      <span className="rounded-full bg-[#05944F]/10 px-2.5 py-1 text-[10px] font-bold text-[#05944F]">100% (3)</span>
                    </div>

                    <p className="mt-6 text-xs font-bold uppercase tracking-wide text-[#6B6B6B]">Previously ordered</p>
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {PREVIOUS_ORDERS.map((p) => (
                        <div
                          key={p.id}
                          className="w-28 shrink-0 overflow-hidden rounded-xl bg-[#F6F6F6] ring-1 ring-[#E5E5E5]"
                        >
                          <img src={p.img} alt="" className="h-20 w-full object-cover" />
                          <div className="p-2">
                            <p className="truncate text-[10px] font-bold">{p.name}</p>
                            <p className="text-[10px] font-semibold text-[#6B6B6B]">${p.price.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-6 text-xs font-bold uppercase tracking-wide text-[#6B6B6B]">
                      Bread <span className="text-[#EF4444]">(Required)</span>
                    </p>
                    <div className="mt-2 space-y-2">
                      {BREAD_OPTIONS.map((b) => (
                        <label
                          key={b.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition ${
                            breadChoice === b.id ? 'border-black bg-[#FAFAFA]' : 'border-[#E5E5E5] bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="bread"
                            checked={breadChoice === b.id}
                            onChange={() => setBreadChoice(b.id)}
                            className="sr-only"
                          />
                          <span className="text-xl">{b.icon}</span>
                          <span className="text-sm font-semibold">{b.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 border-t border-[#E5E5E5] bg-white/95 px-4 pb-6 pt-3 backdrop-blur-md">
                  <div className="mx-auto flex max-w-sm items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E5E5] text-xl font-light"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                        {modalQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalQty((q) => q + 1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E5E5] text-xl font-light"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(selectedItem, modalQty);
                        setSelectedItem(null);
                      }}
                      className="flex-1 rounded-full bg-black py-3.5 text-center font-['Sora',sans-serif] text-sm font-bold text-white shadow-lg transition active:scale-[0.98]"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      Add {modalQty} · ${modalLineTotal.toFixed(2)}{' '}
                      <span className="text-white/70 line-through">${modalStrike.toFixed(2)}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Cart bar */}
        {showCartBar ? (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E5E5E5] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
            <div className="mx-auto max-w-sm px-3 pb-4 pt-2">
              <div className="mb-2 max-h-32 space-y-2 overflow-y-auto border-b border-[#E5E5E5] pb-2">
                {cartItems.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {line.name} ×{line.qty}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => decCart(line.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E5E5E5] text-lg leading-none"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => incCart(line.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E5E5E5] text-lg leading-none"
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-2 rounded-xl bg-[#F5E6C0] px-3 py-2 text-center">
                <p className="text-[11px] font-semibold text-[#6B6B6B]">
                  Saving <span className="font-bold text-[#C8941A]">$31.71</span> with Uber One and promotions
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#6B6B6B]">{cartCount} items</p>
                  <p className="font-['Sora',sans-serif] text-lg font-bold" style={{ fontFamily: "'Sora', sans-serif" }}>
                    ${cartSubtotal.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentScreen('checkout')}
                  className="rounded-full bg-black px-6 py-3.5 font-['Sora',sans-serif] text-sm font-bold text-white shadow-lg transition active:scale-[0.98]"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Go to checkout
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
