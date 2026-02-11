# Data Model — AI Context Map

## PostgreSQL Schema (SaaS Backend)

### stores
Primary table. One row per connected WooCommerce store.
```sql
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_url     VARCHAR(500) NOT NULL UNIQUE,
  api_key_hash  VARCHAR(255) NOT NULL,          -- bcrypt hashed
  wc_version    VARCHAR(20),
  plan          VARCHAR(20) DEFAULT 'free',     -- free|starter|pro|agency
  connected_at  TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at  TIMESTAMPTZ,
  settings      JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true
);
```

### orders
All synced WooCommerce orders. Indexed on `store_id + date_created`.
```sql
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  wc_order_id   INTEGER NOT NULL,
  date_created  TIMESTAMPTZ NOT NULL,
  date_modified TIMESTAMPTZ,
  status        VARCHAR(50) NOT NULL,           -- processing|completed|refunded|etc
  total         DECIMAL(12,2) NOT NULL,
  subtotal      DECIMAL(12,2),
  tax_total     DECIMAL(12,2),
  shipping_total DECIMAL(12,2),
  discount_total DECIMAL(12,2),
  currency      VARCHAR(3) DEFAULT 'USD',
  customer_id   UUID REFERENCES customers(id),
  payment_method VARCHAR(100),
  coupon_used   VARCHAR(100),
  UNIQUE(store_id, wc_order_id)
);
CREATE INDEX idx_orders_store_date ON orders(store_id, date_created);
CREATE INDEX idx_orders_store_status ON orders(store_id, status);
```

### order_items
Line items for each order.
```sql
CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id      UUID NOT NULL REFERENCES stores(id),
  product_id    UUID REFERENCES products(id),
  product_name  VARCHAR(500),
  sku           VARCHAR(100),
  quantity      INTEGER NOT NULL DEFAULT 1,
  subtotal      DECIMAL(12,2),
  total         DECIMAL(12,2)
);
CREATE INDEX idx_order_items_store ON order_items(store_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### products
Product catalog synced from WooCommerce.
```sql
CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id),
  wc_product_id  INTEGER NOT NULL,
  name           VARCHAR(500) NOT NULL,
  sku            VARCHAR(100),
  price          DECIMAL(12,2),
  regular_price  DECIMAL(12,2),
  sale_price     DECIMAL(12,2),
  category_id    UUID REFERENCES categories(id),
  category_name  VARCHAR(255),
  stock_quantity INTEGER,
  stock_status   VARCHAR(50),
  status         VARCHAR(50) DEFAULT 'publish',
  type           VARCHAR(50) DEFAULT 'simple',
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  UNIQUE(store_id, wc_product_id)
);
CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_products_category ON products(store_id, category_id);
```

### customers
Customer records with computed lifetime metrics.
```sql
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  wc_customer_id  INTEGER NOT NULL,
  email_hash      VARCHAR(64),                  -- SHA256 hash (never store raw email)
  display_name    VARCHAR(255),
  total_spent     DECIMAL(12,2) DEFAULT 0,
  order_count     INTEGER DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  UNIQUE(store_id, wc_customer_id)
);
CREATE INDEX idx_customers_store ON customers(store_id);
```

### categories
Product categories.
```sql
CREATE TABLE categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES stores(id),
  wc_category_id   INTEGER NOT NULL,
  name             VARCHAR(255) NOT NULL,
  parent_id        UUID REFERENCES categories(id),
  product_count    INTEGER DEFAULT 0,
  UNIQUE(store_id, wc_category_id)
);
```

### coupons
```sql
CREATE TABLE coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id),
  wc_coupon_id   INTEGER NOT NULL,
  code           VARCHAR(100) NOT NULL,
  discount_type  VARCHAR(50),
  amount         DECIMAL(12,2),
  usage_count    INTEGER DEFAULT 0,
  UNIQUE(store_id, wc_coupon_id)
);
```

### saved_charts
User's pinned charts for their dashboard.
```sql
CREATE TABLE saved_charts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  title           VARCHAR(255) NOT NULL,
  query_text      TEXT,
  chart_config    JSONB NOT NULL,
  position_index  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### conversations
Chat conversation history.
```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id),
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### sync_logs
Track sync health and history.
```sql
CREATE TABLE sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  sync_type       VARCHAR(50) NOT NULL,       -- full|incremental|orders|products|customers
  records_synced  INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'running', -- running|completed|failed
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0,            -- number of retry attempts
  next_retry_at   TIMESTAMPTZ                   -- when next retry should be attempted
);
```

## Critical Rules
- **Every table** has `store_id` — always filter by it
- **Every query** must include `WHERE store_id = ?` for tenant isolation
- **Customer emails** are stored as SHA256 hashes, never plaintext
- **AI queries** run on a read-only PostgreSQL user (cannot INSERT/UPDATE/DELETE)
- **Timestamps** are always UTC (`TIMESTAMPTZ`)
