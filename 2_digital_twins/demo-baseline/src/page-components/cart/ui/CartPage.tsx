'use client';

import { useState, useEffect } from 'react';

import { Header } from '@/widgets/header';
import { Footer } from '@/widgets/footer';

export function CartPage() {
  // 1. Dynamic State for Cart Items
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false); // Prevents Next.js hydration errors

  // 2. Load the cart from browser memory when the page opens
  useEffect(() => {
    const savedCart = localStorage.getItem('decathlon_cart');
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Cart parsing error', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // 3. Save the cart back to memory whenever it changes (like clicking + or -)
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('decathlon_cart', JSON.stringify(cartItems));
      // Triggers an event so we can make the Header cart count update later!
      window.dispatchEvent(new Event('cartUpdated'));
    }
  }, [cartItems, isLoaded]);

  // 4. Function to handle + and - buttons
  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cartItems];
    newCart[index].quantity += delta;

    // If quantity goes to 0, remove the item entirely
    if (newCart[index].quantity < 1) {
      newCart.splice(index, 1);
    }
    setCartItems(newCart);
  };

  // 5. Dynamic Calculations
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 50000 || cartItems.length === 0 ? 0 : 3000;
  const total = subtotal + shipping;

  // Wait for memory to load before showing the UI
  if (!isLoaded) return <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>장바구니</h1>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}
          className="lg:grid-cols-[2fr_1fr]"
        >
          {/* LEFT: Cart Items List */}
          <div>
            {cartItems.length === 0 ? (
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '48px',
                  textAlign: 'center',
                  border: '1px solid #e5e7eb',
                }}
              >
                <p style={{ fontSize: '16px', color: '#6b7280', marginBottom: '16px' }}>
                  장바구니가 비어 있습니다.
                </p>
                <a
                  href="/category/running"
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#0082C3',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                  }}
                >
                  쇼핑하러 가기
                </a>
              </div>
            ) : (
              cartItems.map((item, index) => (
                <div
                  key={`${item.id}-${item.size}-${index}`}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px',
                    display: 'flex',
                    gap: '16px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <img
                    src={item.imageUrl || item.images?.[0]}
                    alt={item.name}
                    width={100}
                    height={100}
                    style={{
                      width: '100px',
                      height: '100px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#0082C3',
                          marginBottom: '4px',
                          fontWeight: 'bold',
                        }}
                      >
                        {item.brand}
                      </p>
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          marginBottom: '8px',
                          color: '#111827',
                        }}
                      >
                        {item.name}
                      </p>
                      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                        사이즈: {item.size}
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Dynamic Quantity Buttons */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          padding: '4px 12px',
                        }}
                      >
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: '#6b7280',
                          }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: '#6b7280',
                          }}
                        >
                          +
                        </button>
                      </div>

                      <p style={{ fontSize: '18px', fontWeight: 900 }}>
                        {(item.price * item.quantity).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* RIGHT: Order Summary */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              height: 'fit-content',
              position: 'sticky',
              top: '130px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '20px' }}>주문 요약</h2>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#6b7280' }}>상품 금액</span>
              <span style={{ fontWeight: 'bold' }}>{subtotal.toLocaleString()}원</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '20px',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#6b7280' }}>배송비</span>
              <span style={{ fontWeight: 'bold', color: shipping === 0 ? '#0082C3' : '#111827' }}>
                {shipping === 0 ? '무료' : `${shipping.toLocaleString()}원`}
              </span>
            </div>
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                paddingTop: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontWeight: 900, fontSize: '16px' }}>총 결제 금액</span>
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#111827' }}>
                {total.toLocaleString()}원
              </span>
            </div>
            <button
              disabled={cartItems.length === 0}
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: cartItems.length === 0 ? '#e5e7eb' : '#0082C3',
                color: cartItems.length === 0 ? '#9ca3af' : 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              결제하기
            </button>
            <a
              href="/category/running"
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: '16px',
                fontSize: '14px',
                color: '#6b7280',
                textDecoration: 'underline',
              }}
            >
              쇼핑 계속하기
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
