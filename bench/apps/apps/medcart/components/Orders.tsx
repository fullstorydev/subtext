import { Order } from "../types";

interface Props {
  orders: Order[];
}

export function Orders({ orders }: Props) {
  return (
    <div className="orders">
      <h1>Order History</h1>

      <div className="orders-list">
        {orders.map((order) => (
          <div key={order.id} className="order-card">
            <div className="order-header">
              <div>
                <div className="order-id">{order.id}</div>
                <div className="order-date">Placed {order.date}</div>
              </div>
              <div className="order-right">
                <span className={`status-badge status-${order.status}`}>
                  {order.status}
                </span>
                <div className="order-total">${order.total.toFixed(2)}</div>
              </div>
            </div>

            <div className="order-items">
              {order.items.map((item, i) => (
                <div key={i} className="order-item">
                  <span className="item-name">{item.name}</span>
                  <span className="item-qty">x{item.quantity}</span>
                  <span className="item-price">${item.price.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="shipping-info">
              <div className="shipping-label">Shipped to:</div>
              <div className="shipping-address">
                <strong>{order.shippingAddress.recipientName}</strong>
                <br />
                {order.shippingAddress.street}
                {order.shippingAddress.apt && `, ${order.shippingAddress.apt}`}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                {order.shippingAddress.zip}
                <br />
                Phone: {order.shippingAddress.recipientPhone}
              </div>
              {order.trackingNumber && (
                <div className="tracking">Tracking: {order.trackingNumber}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .orders h1 { font-size: 1.5rem; margin-bottom: 24px; }
        .orders-list { display: flex; flex-direction: column; gap: 16px; }
        .order-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }
        .order-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0f0f0;
        }
        .order-id { font-weight: 700; font-size: 0.95rem; }
        .order-date { font-size: 0.85rem; color: #666; margin-top: 2px; }
        .order-right { text-align: right; }
        .order-total { font-weight: 700; margin-top: 4px; }
        .status-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .status-delivered { background: #e8f5e9; color: #2e7d32; }
        .status-shipped { background: #e3f2fd; color: #1565c0; }
        .status-processing { background: #fff3e0; color: #e65100; }
        .status-cancelled { background: #fce4ec; color: #c62828; }
        .order-items { margin-bottom: 16px; }
        .order-item {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 0.9rem;
          border-bottom: 1px solid #f5f5f5;
        }
        .item-name { flex: 1; }
        .item-qty { width: 40px; text-align: center; color: #666; }
        .item-price { width: 80px; text-align: right; }
        .shipping-info {
          background: #f9f9f9;
          border-radius: 6px;
          padding: 12px;
          font-size: 0.9rem;
        }
        .shipping-label {
          font-weight: 600;
          font-size: 0.8rem;
          color: #555;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .shipping-address { line-height: 1.5; }
        .tracking { margin-top: 8px; color: #1976d2; font-size: 0.85rem; }
      `}</style>
    </div>
  );
}
