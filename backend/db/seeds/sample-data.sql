-- ============================================================
-- Woo AI Analytics — Sample Seed Data
-- Populates the backend DB with realistic WooCommerce data
-- for a store selling electronics, clothing, and home goods.
-- ============================================================

-- Use the existing store
DO $$
DECLARE
  v_store_id UUID := 'b8a7061a-e87e-4d97-a402-fed565f4f7a5';

  -- Category IDs
  cat_electronics UUID;
  cat_phones      UUID;
  cat_laptops     UUID;
  cat_accessories UUID;
  cat_clothing    UUID;
  cat_mens        UUID;
  cat_womens      UUID;
  cat_home        UUID;
  cat_kitchen     UUID;
  cat_decor       UUID;

  -- Product IDs
  p_iphone       UUID;
  p_samsung      UUID;
  p_pixel        UUID;
  p_macbook      UUID;
  p_thinkpad     UUID;
  p_dell         UUID;
  p_airpods      UUID;
  p_charger      UUID;
  p_case         UUID;
  p_tshirt_m     UUID;
  p_jeans_m      UUID;
  p_jacket_m     UUID;
  p_dress_w      UUID;
  p_blouse_w     UUID;
  p_sneakers_w   UUID;
  p_blender      UUID;
  p_coffeemaker  UUID;
  p_pan          UUID;
  p_lamp         UUID;
  p_cushion      UUID;

  -- Customer IDs
  c_alice  UUID;
  c_bob    UUID;
  c_carol  UUID;
  c_dave   UUID;
  c_eve    UUID;
  c_frank  UUID;
  c_grace  UUID;
  c_heidi  UUID;
  c_ivan   UUID;
  c_judy   UUID;
  c_karl   UUID;
  c_lisa   UUID;

  -- Coupon IDs
  coup_welcome UUID;
  coup_summer  UUID;
  coup_vip     UUID;

  -- Order IDs (we'll need them for order_items)
  o1  UUID; o2  UUID; o3  UUID; o4  UUID; o5  UUID;
  o6  UUID; o7  UUID; o8  UUID; o9  UUID; o10 UUID;
  o11 UUID; o12 UUID; o13 UUID; o14 UUID; o15 UUID;
  o16 UUID; o17 UUID; o18 UUID; o19 UUID; o20 UUID;
  o21 UUID; o22 UUID; o23 UUID; o24 UUID; o25 UUID;
  o26 UUID; o27 UUID; o28 UUID; o29 UUID; o30 UUID;
  o31 UUID; o32 UUID; o33 UUID; o34 UUID; o35 UUID;
  o36 UUID; o37 UUID; o38 UUID; o39 UUID; o40 UUID;

BEGIN

-- ─── Clear existing data for this store ──────────────────────
DELETE FROM order_items WHERE store_id = v_store_id;
DELETE FROM orders WHERE store_id = v_store_id;
DELETE FROM products WHERE store_id = v_store_id;
DELETE FROM customers WHERE store_id = v_store_id;
DELETE FROM categories WHERE store_id = v_store_id;
DELETE FROM coupons WHERE store_id = v_store_id;
DELETE FROM sync_logs WHERE store_id = v_store_id;

-- ─── Categories (3 top-level, 7 sub-categories) ─────────────
INSERT INTO categories (store_id, wc_category_id, name, product_count)
VALUES (v_store_id, 10, 'Electronics', 9)
RETURNING id INTO cat_electronics;

INSERT INTO categories (store_id, wc_category_id, name, product_count)
VALUES (v_store_id, 20, 'Clothing', 6)
RETURNING id INTO cat_clothing;

INSERT INTO categories (store_id, wc_category_id, name, product_count)
VALUES (v_store_id, 30, 'Home & Garden', 5)
RETURNING id INTO cat_home;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 11, 'Phones', cat_electronics, 3)
RETURNING id INTO cat_phones;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 12, 'Laptops', cat_electronics, 3)
RETURNING id INTO cat_laptops;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 13, 'Accessories', cat_electronics, 3)
RETURNING id INTO cat_accessories;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 21, 'Men''s Clothing', cat_clothing, 3)
RETURNING id INTO cat_mens;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 22, 'Women''s Clothing', cat_clothing, 3)
RETURNING id INTO cat_womens;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 31, 'Kitchen', cat_home, 3)
RETURNING id INTO cat_kitchen;

INSERT INTO categories (store_id, wc_category_id, name, parent_id, product_count)
VALUES (v_store_id, 32, 'Decor', cat_home, 2)
RETURNING id INTO cat_decor;

-- ─── Products (20 products across all categories) ────────────

-- Phones
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 101, 'iPhone 15 Pro', 'IP15PRO', 999.00, 999.00, NULL, cat_phones, 'Phones', 25, 'instock', 'publish', 'simple', NOW() - INTERVAL '90 days')
RETURNING id INTO p_iphone;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 102, 'Samsung Galaxy S24', 'SGS24', 849.00, 899.00, 849.00, cat_phones, 'Phones', 18, 'instock', 'publish', 'simple', NOW() - INTERVAL '85 days')
RETURNING id INTO p_samsung;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 103, 'Google Pixel 8', 'GP8', 699.00, 699.00, NULL, cat_phones, 'Phones', 12, 'instock', 'publish', 'simple', NOW() - INTERVAL '80 days')
RETURNING id INTO p_pixel;

-- Laptops
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 104, 'MacBook Air M3', 'MBA-M3', 1299.00, 1299.00, NULL, cat_laptops, 'Laptops', 10, 'instock', 'publish', 'simple', NOW() - INTERVAL '75 days')
RETURNING id INTO p_macbook;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 105, 'ThinkPad X1 Carbon', 'TPX1C', 1449.00, 1549.00, 1449.00, cat_laptops, 'Laptops', 7, 'instock', 'publish', 'simple', NOW() - INTERVAL '70 days')
RETURNING id INTO p_thinkpad;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 106, 'Dell XPS 15', 'DXPS15', 1199.00, 1199.00, NULL, cat_laptops, 'Laptops', 5, 'instock', 'publish', 'simple', NOW() - INTERVAL '65 days')
RETURNING id INTO p_dell;

-- Accessories
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 107, 'AirPods Pro 2', 'APP2', 249.00, 249.00, NULL, cat_accessories, 'Accessories', 40, 'instock', 'publish', 'simple', NOW() - INTERVAL '60 days')
RETURNING id INTO p_airpods;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 108, 'USB-C Fast Charger 65W', 'USBC65', 39.99, 49.99, 39.99, cat_accessories, 'Accessories', 100, 'instock', 'publish', 'simple', NOW() - INTERVAL '55 days')
RETURNING id INTO p_charger;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 109, 'Premium Phone Case', 'PCASE', 29.99, 29.99, NULL, cat_accessories, 'Accessories', 75, 'instock', 'publish', 'simple', NOW() - INTERVAL '50 days')
RETURNING id INTO p_case;

-- Men's Clothing
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 201, 'Classic Cotton T-Shirt', 'MTEE01', 24.99, 24.99, NULL, cat_mens, 'Men''s Clothing', 200, 'instock', 'publish', 'simple', NOW() - INTERVAL '45 days')
RETURNING id INTO p_tshirt_m;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 202, 'Slim Fit Jeans', 'MJEAN01', 59.99, 69.99, 59.99, cat_mens, 'Men''s Clothing', 80, 'instock', 'publish', 'simple', NOW() - INTERVAL '40 days')
RETURNING id INTO p_jeans_m;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 203, 'Wool Blend Jacket', 'MJKT01', 149.99, 149.99, NULL, cat_mens, 'Men''s Clothing', 30, 'instock', 'publish', 'simple', NOW() - INTERVAL '35 days')
RETURNING id INTO p_jacket_m;

-- Women's Clothing
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 204, 'Summer Floral Dress', 'WDRS01', 79.99, 89.99, 79.99, cat_womens, 'Women''s Clothing', 45, 'instock', 'publish', 'simple', NOW() - INTERVAL '30 days')
RETURNING id INTO p_dress_w;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 205, 'Silk Blouse', 'WBLS01', 64.99, 64.99, NULL, cat_womens, 'Women''s Clothing', 35, 'instock', 'publish', 'simple', NOW() - INTERVAL '25 days')
RETURNING id INTO p_blouse_w;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 206, 'Canvas Sneakers', 'WSNK01', 54.99, 54.99, NULL, cat_womens, 'Women''s Clothing', 60, 'instock', 'publish', 'simple', NOW() - INTERVAL '20 days')
RETURNING id INTO p_sneakers_w;

-- Kitchen
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 301, 'Pro Blender 1200W', 'KBLD01', 89.99, 89.99, NULL, cat_kitchen, 'Kitchen', 20, 'instock', 'publish', 'simple', NOW() - INTERVAL '60 days')
RETURNING id INTO p_blender;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 302, 'Drip Coffee Maker', 'KCOF01', 69.99, 79.99, 69.99, cat_kitchen, 'Kitchen', 15, 'instock', 'publish', 'simple', NOW() - INTERVAL '50 days')
RETURNING id INTO p_coffeemaker;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 303, 'Cast Iron Skillet 12"', 'KPAN01', 44.99, 44.99, NULL, cat_kitchen, 'Kitchen', 50, 'instock', 'publish', 'simple', NOW() - INTERVAL '45 days')
RETURNING id INTO p_pan;

-- Decor
INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 304, 'Modern Table Lamp', 'DLMP01', 59.99, 59.99, NULL, cat_decor, 'Decor', 25, 'instock', 'publish', 'simple', NOW() - INTERVAL '40 days')
RETURNING id INTO p_lamp;

INSERT INTO products (store_id, wc_product_id, name, sku, price, regular_price, sale_price, category_id, category_name, stock_quantity, stock_status, status, type, created_at)
VALUES (v_store_id, 305, 'Velvet Throw Cushion', 'DCSH01', 34.99, 34.99, NULL, cat_decor, 'Decor', 70, 'instock', 'publish', 'simple', NOW() - INTERVAL '35 days')
RETURNING id INTO p_cushion;

-- ─── Customers (12 customers) ────────────────────────────────
INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 1, md5('alice@example.com'), 'Alice Johnson', 2847.98, 5, NOW() - INTERVAL '80 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '85 days')
RETURNING id INTO c_alice;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 2, md5('bob@example.com'), 'Bob Smith', 1698.99, 3, NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '75 days')
RETURNING id INTO c_bob;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 3, md5('carol@example.com'), 'Carol Davis', 1249.98, 4, NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '65 days')
RETURNING id INTO c_carol;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 4, md5('dave@example.com'), 'Dave Wilson', 3548.00, 4, NOW() - INTERVAL '75 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '80 days')
RETURNING id INTO c_dave;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 5, md5('eve@example.com'), 'Eve Martinez', 574.97, 3, NOW() - INTERVAL '45 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '50 days')
RETURNING id INTO c_eve;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 6, md5('frank@example.com'), 'Frank Brown', 1999.00, 2, NOW() - INTERVAL '50 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '55 days')
RETURNING id INTO c_frank;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 7, md5('grace@example.com'), 'Grace Lee', 419.96, 3, NOW() - INTERVAL '40 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '45 days')
RETURNING id INTO c_grace;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 8, md5('heidi@example.com'), 'Heidi Taylor', 2149.98, 3, NOW() - INTERVAL '55 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '60 days')
RETURNING id INTO c_heidi;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 9, md5('ivan@example.com'), 'Ivan Chen', 999.00, 1, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days')
RETURNING id INTO c_ivan;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 10, md5('judy@example.com'), 'Judy Anderson', 334.97, 2, NOW() - INTERVAL '30 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '35 days')
RETURNING id INTO c_judy;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 11, md5('karl@example.com'), 'Karl Weber', 1548.98, 3, NOW() - INTERVAL '65 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '70 days')
RETURNING id INTO c_karl;

INSERT INTO customers (store_id, wc_customer_id, email_hash, display_name, total_spent, order_count, first_order_date, last_order_date, created_at)
VALUES (v_store_id, 12, md5('lisa@example.com'), 'Lisa Park', 849.00, 2, NOW() - INTERVAL '35 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '40 days')
RETURNING id INTO c_lisa;

-- ─── Coupons ─────────────────────────────────────────────────
INSERT INTO coupons (store_id, wc_coupon_id, code, discount_type, amount, usage_count)
VALUES (v_store_id, 1, 'WELCOME10', 'percent', 10.00, 8)
RETURNING id INTO coup_welcome;

INSERT INTO coupons (store_id, wc_coupon_id, code, discount_type, amount, usage_count)
VALUES (v_store_id, 2, 'SUMMER25', 'fixed_cart', 25.00, 5)
RETURNING id INTO coup_summer;

INSERT INTO coupons (store_id, wc_coupon_id, code, discount_type, amount, usage_count)
VALUES (v_store_id, 3, 'VIP20', 'percent', 20.00, 3)
RETURNING id INTO coup_vip;

-- ─── Orders (40 orders over the past 3 months) ──────────────
-- Mix of completed, processing, refunded, cancelled statuses
-- Spread across different dates, customers, and payment methods

-- Order 1: Alice - iPhone (80 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1001, NOW() - INTERVAL '80 days', 'completed', 999.00, 999.00, 0, 0, 0, 'USD', c_alice, 'stripe', NULL)
RETURNING id INTO o1;

-- Order 2: Bob - MacBook (70 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1002, NOW() - INTERVAL '70 days', 'completed', 1299.00, 1299.00, 0, 0, 0, 'USD', c_bob, 'stripe', NULL)
RETURNING id INTO o2;

-- Order 3: Carol - Dress + Blouse (60 days ago, with coupon)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1003, NOW() - INTERVAL '60 days', 'completed', 130.48, 144.98, 0, 0, 14.50, 'USD', c_carol, 'paypal', 'WELCOME10')
RETURNING id INTO o3;

-- Order 4: Dave - ThinkPad (75 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1004, NOW() - INTERVAL '75 days', 'completed', 1449.00, 1449.00, 0, 0, 0, 'USD', c_dave, 'stripe', NULL)
RETURNING id INTO o4;

-- Order 5: Eve - T-shirts x3 + Jeans (45 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1005, NOW() - INTERVAL '45 days', 'completed', 134.96, 134.96, 0, 0, 0, 'USD', c_eve, 'paypal', NULL)
RETURNING id INTO o5;

-- Order 6: Frank - Samsung + AirPods (50 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1006, NOW() - INTERVAL '50 days', 'completed', 1098.00, 1098.00, 0, 0, 0, 'USD', c_frank, 'stripe', NULL)
RETURNING id INTO o6;

-- Order 7: Grace - Blender + Coffee Maker (40 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1007, NOW() - INTERVAL '40 days', 'completed', 159.98, 159.98, 0, 0, 0, 'USD', c_grace, 'paypal', NULL)
RETURNING id INTO o7;

-- Order 8: Heidi - iPhone + Case (55 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1008, NOW() - INTERVAL '55 days', 'completed', 1028.99, 1028.99, 0, 0, 0, 'USD', c_heidi, 'stripe', NULL)
RETURNING id INTO o8;

-- Order 9: Alice - Charger + AirPods (50 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1009, NOW() - INTERVAL '50 days', 'completed', 288.99, 288.99, 0, 0, 0, 'USD', c_alice, 'stripe', NULL)
RETURNING id INTO o9;

-- Order 10: Karl - Dell XPS (65 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1010, NOW() - INTERVAL '65 days', 'completed', 1199.00, 1199.00, 0, 0, 0, 'USD', c_karl, 'stripe', NULL)
RETURNING id INTO o10;

-- Order 11: Carol - Sneakers (45 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1011, NOW() - INTERVAL '45 days', 'completed', 54.99, 54.99, 0, 0, 0, 'USD', c_carol, 'paypal', NULL)
RETURNING id INTO o11;

-- Order 12: Dave - AirPods + Charger + Case (60 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1012, NOW() - INTERVAL '60 days', 'completed', 318.98, 318.98, 0, 0, 0, 'USD', c_dave, 'paypal', NULL)
RETURNING id INTO o12;

-- Order 13: Lisa - Samsung (35 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1013, NOW() - INTERVAL '35 days', 'completed', 849.00, 849.00, 0, 0, 0, 'USD', c_lisa, 'stripe', NULL)
RETURNING id INTO o13;

-- Order 14: Bob - Jacket + T-shirt (30 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1014, NOW() - INTERVAL '30 days', 'completed', 174.98, 174.98, 0, 0, 0, 'USD', c_bob, 'paypal', NULL)
RETURNING id INTO o14;

-- Order 15: Judy - Cushions x2 + Lamp (30 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1015, NOW() - INTERVAL '30 days', 'completed', 129.97, 129.97, 0, 0, 0, 'USD', c_judy, 'paypal', NULL)
RETURNING id INTO o15;

-- Order 16: Eve - Dress (25 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1016, NOW() - INTERVAL '25 days', 'completed', 79.99, 79.99, 0, 0, 0, 'USD', c_eve, 'stripe', NULL)
RETURNING id INTO o16;

-- Order 17: Ivan - iPhone (20 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1017, NOW() - INTERVAL '20 days', 'completed', 999.00, 999.00, 0, 0, 0, 'USD', c_ivan, 'stripe', NULL)
RETURNING id INTO o17;

-- Order 18: Heidi - Blouse + Sneakers (18 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1018, NOW() - INTERVAL '18 days', 'completed', 119.98, 119.98, 0, 0, 0, 'USD', c_heidi, 'paypal', NULL)
RETURNING id INTO o18;

-- Order 19: Grace - Pan + Cushion (15 days ago, with coupon)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1019, NOW() - INTERVAL '15 days', 'completed', 54.98, 79.98, 0, 0, 25.00, 'USD', c_grace, 'paypal', 'SUMMER25')
RETURNING id INTO o19;

-- Order 20: Karl - Pixel + Case (20 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1020, NOW() - INTERVAL '20 days', 'completed', 728.99, 728.99, 0, 0, 0, 'USD', c_karl, 'stripe', NULL)
RETURNING id INTO o20;

-- Order 21: Alice - Coffee Maker (15 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1021, NOW() - INTERVAL '15 days', 'completed', 69.99, 69.99, 0, 0, 0, 'USD', c_alice, 'paypal', NULL)
RETURNING id INTO o21;

-- Order 22: Dave - iPhone + AirPods (10 days ago, VIP coupon)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1022, NOW() - INTERVAL '10 days', 'completed', 998.40, 1248.00, 0, 0, 249.60, 'USD', c_dave, 'stripe', 'VIP20')
RETURNING id INTO o22;

-- Order 23: Carol - Lamp + Blender (8 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1023, NOW() - INTERVAL '8 days', 'completed', 149.98, 149.98, 0, 0, 0, 'USD', c_carol, 'stripe', NULL)
RETURNING id INTO o23;

-- Order 24: Frank - Pixel (12 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1024, NOW() - INTERVAL '12 days', 'completed', 699.00, 699.00, 0, 0, 0, 'USD', c_frank, 'stripe', NULL)
RETURNING id INTO o24;

-- Order 25: Alice - Jeans + Blouse (2 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1025, NOW() - INTERVAL '2 days', 'processing', 124.98, 124.98, 0, 0, 0, 'USD', c_alice, 'stripe', NULL)
RETURNING id INTO o25;

-- Order 26: Bob - Charger x2 (5 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1026, NOW() - INTERVAL '5 days', 'processing', 79.98, 79.98, 0, 0, 0, 'USD', c_bob, 'stripe', NULL)
RETURNING id INTO o26;

-- Order 27: Carol - T-shirt x2 (1 day ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1027, NOW() - INTERVAL '1 day', 'processing', 49.98, 49.98, 0, 0, 0, 'USD', c_carol, 'paypal', NULL)
RETURNING id INTO o27;

-- Order 28: Dave - MacBook (3 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1028, NOW() - INTERVAL '3 days', 'processing', 1299.00, 1299.00, 0, 0, 0, 'USD', c_dave, 'stripe', NULL)
RETURNING id INTO o28;

-- Order 29: Grace - Dress (4 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1029, NOW() - INTERVAL '4 days', 'processing', 79.99, 79.99, 0, 0, 0, 'USD', c_grace, 'paypal', NULL)
RETURNING id INTO o29;

-- Order 30: Heidi - Samsung (6 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1030, NOW() - INTERVAL '6 days', 'completed', 849.00, 849.00, 0, 0, 0, 'USD', c_heidi, 'stripe', NULL)
RETURNING id INTO o30;

-- Order 31: Judy - Skillet + Lamp (8 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1031, NOW() - INTERVAL '8 days', 'completed', 104.98, 104.98, 0, 0, 0, 'USD', c_judy, 'paypal', NULL)
RETURNING id INTO o31;

-- Order 32: Karl - Jacket (9 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1032, NOW() - INTERVAL '9 days', 'completed', 149.99, 149.99, 0, 0, 0, 'USD', c_karl, 'stripe', NULL)
RETURNING id INTO o32;

-- Order 33: Eve - Sneakers + Cushion (7 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1033, NOW() - INTERVAL '7 days', 'completed', 89.98, 89.98, 0, 0, 0, 'USD', c_eve, 'stripe', NULL)
RETURNING id INTO o33;

-- Order 34: Lisa - AirPods (12 days ago, refunded)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1034, NOW() - INTERVAL '12 days', 'refunded', 249.00, 249.00, 0, 0, 0, 'USD', c_lisa, 'paypal', NULL)
RETURNING id INTO o34;

-- Order 35: Alice - Lamp (18 days ago, cancelled)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1035, NOW() - INTERVAL '18 days', 'cancelled', 59.99, 59.99, 0, 0, 0, 'USD', c_alice, 'stripe', NULL)
RETURNING id INTO o35;

-- Order 36: Bob - ThinkPad (40 days ago, refunded)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1036, NOW() - INTERVAL '40 days', 'refunded', 1449.00, 1449.00, 0, 0, 0, 'USD', c_bob, 'stripe', NULL)
RETURNING id INTO o36;

-- Order 37: Carol - Jacket + Jeans (35 days ago, with WELCOME10)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1037, NOW() - INTERVAL '35 days', 'completed', 188.98, 209.98, 0, 0, 21.00, 'USD', c_carol, 'stripe', 'WELCOME10')
RETURNING id INTO o37;

-- Order 38: Dave - Coffee Maker (25 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1038, NOW() - INTERVAL '25 days', 'completed', 69.99, 69.99, 0, 0, 0, 'USD', c_dave, 'paypal', NULL)
RETURNING id INTO o38;

-- Order 39: Eve - Blouse (14 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1039, NOW() - INTERVAL '14 days', 'completed', 64.99, 64.99, 0, 0, 0, 'USD', c_eve, 'stripe', NULL)
RETURNING id INTO o39;

-- Order 40: Karl - Blender + Pan (11 days ago)
INSERT INTO orders (store_id, wc_order_id, date_created, status, total, subtotal, tax_total, shipping_total, discount_total, currency, customer_id, payment_method, coupon_used)
VALUES (v_store_id, 1040, NOW() - INTERVAL '11 days', 'completed', 134.98, 134.98, 0, 0, 0, 'USD', c_karl, 'stripe', NULL)
RETURNING id INTO o40;

-- ─── Order Items ─────────────────────────────────────────────

-- o1: iPhone
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o1, v_store_id, p_iphone, 'iPhone 15 Pro', 'IP15PRO', 1, 999.00, 999.00);

-- o2: MacBook
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o2, v_store_id, p_macbook, 'MacBook Air M3', 'MBA-M3', 1, 1299.00, 1299.00);

-- o3: Dress + Blouse
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o3, v_store_id, p_dress_w, 'Summer Floral Dress', 'WDRS01', 1, 79.99, 79.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o3, v_store_id, p_blouse_w, 'Silk Blouse', 'WBLS01', 1, 64.99, 64.99);

-- o4: ThinkPad
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o4, v_store_id, p_thinkpad, 'ThinkPad X1 Carbon', 'TPX1C', 1, 1449.00, 1449.00);

-- o5: T-shirts x3 + Jeans
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o5, v_store_id, p_tshirt_m, 'Classic Cotton T-Shirt', 'MTEE01', 3, 74.97, 74.97);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o5, v_store_id, p_jeans_m, 'Slim Fit Jeans', 'MJEAN01', 1, 59.99, 59.99);

-- o6: Samsung + AirPods
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o6, v_store_id, p_samsung, 'Samsung Galaxy S24', 'SGS24', 1, 849.00, 849.00);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o6, v_store_id, p_airpods, 'AirPods Pro 2', 'APP2', 1, 249.00, 249.00);

-- o7: Blender + Coffee Maker
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o7, v_store_id, p_blender, 'Pro Blender 1200W', 'KBLD01', 1, 89.99, 89.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o7, v_store_id, p_coffeemaker, 'Drip Coffee Maker', 'KCOF01', 1, 69.99, 69.99);

-- o8: iPhone + Case
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o8, v_store_id, p_iphone, 'iPhone 15 Pro', 'IP15PRO', 1, 999.00, 999.00);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o8, v_store_id, p_case, 'Premium Phone Case', 'PCASE', 1, 29.99, 29.99);

-- o9: Charger + AirPods
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o9, v_store_id, p_charger, 'USB-C Fast Charger 65W', 'USBC65', 1, 39.99, 39.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o9, v_store_id, p_airpods, 'AirPods Pro 2', 'APP2', 1, 249.00, 249.00);

-- o10: Dell XPS
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o10, v_store_id, p_dell, 'Dell XPS 15', 'DXPS15', 1, 1199.00, 1199.00);

-- o11: Sneakers
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o11, v_store_id, p_sneakers_w, 'Canvas Sneakers', 'WSNK01', 1, 54.99, 54.99);

-- o12: AirPods + Charger + Case
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o12, v_store_id, p_airpods, 'AirPods Pro 2', 'APP2', 1, 249.00, 249.00);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o12, v_store_id, p_charger, 'USB-C Fast Charger 65W', 'USBC65', 1, 39.99, 39.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o12, v_store_id, p_case, 'Premium Phone Case', 'PCASE', 1, 29.99, 29.99);

-- o13: Samsung
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o13, v_store_id, p_samsung, 'Samsung Galaxy S24', 'SGS24', 1, 849.00, 849.00);

-- o14: Jacket + T-shirt
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o14, v_store_id, p_jacket_m, 'Wool Blend Jacket', 'MJKT01', 1, 149.99, 149.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o14, v_store_id, p_tshirt_m, 'Classic Cotton T-Shirt', 'MTEE01', 1, 24.99, 24.99);

-- o15: Cushions x2 + Lamp
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o15, v_store_id, p_cushion, 'Velvet Throw Cushion', 'DCSH01', 2, 69.98, 69.98);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o15, v_store_id, p_lamp, 'Modern Table Lamp', 'DLMP01', 1, 59.99, 59.99);

-- o16: Dress
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o16, v_store_id, p_dress_w, 'Summer Floral Dress', 'WDRS01', 1, 79.99, 79.99);

-- o17: iPhone
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o17, v_store_id, p_iphone, 'iPhone 15 Pro', 'IP15PRO', 1, 999.00, 999.00);

-- o18: Blouse + Sneakers
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o18, v_store_id, p_blouse_w, 'Silk Blouse', 'WBLS01', 1, 64.99, 64.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o18, v_store_id, p_sneakers_w, 'Canvas Sneakers', 'WSNK01', 1, 54.99, 54.99);

-- o19: Pan + Cushion
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o19, v_store_id, p_pan, 'Cast Iron Skillet 12"', 'KPAN01', 1, 44.99, 44.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o19, v_store_id, p_cushion, 'Velvet Throw Cushion', 'DCSH01', 1, 34.99, 34.99);

-- o20: Pixel + Case
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o20, v_store_id, p_pixel, 'Google Pixel 8', 'GP8', 1, 699.00, 699.00);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o20, v_store_id, p_case, 'Premium Phone Case', 'PCASE', 1, 29.99, 29.99);

-- o21: Coffee Maker
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o21, v_store_id, p_coffeemaker, 'Drip Coffee Maker', 'KCOF01', 1, 69.99, 69.99);

-- o22: iPhone + AirPods
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o22, v_store_id, p_iphone, 'iPhone 15 Pro', 'IP15PRO', 1, 999.00, 999.00);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o22, v_store_id, p_airpods, 'AirPods Pro 2', 'APP2', 1, 249.00, 249.00);

-- o23: Lamp + Blender
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o23, v_store_id, p_lamp, 'Modern Table Lamp', 'DLMP01', 1, 59.99, 59.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o23, v_store_id, p_blender, 'Pro Blender 1200W', 'KBLD01', 1, 89.99, 89.99);

-- o24: Pixel
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o24, v_store_id, p_pixel, 'Google Pixel 8', 'GP8', 1, 699.00, 699.00);

-- o25: Jeans + Blouse
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o25, v_store_id, p_jeans_m, 'Slim Fit Jeans', 'MJEAN01', 1, 59.99, 59.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o25, v_store_id, p_blouse_w, 'Silk Blouse', 'WBLS01', 1, 64.99, 64.99);

-- o26: Charger x2
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o26, v_store_id, p_charger, 'USB-C Fast Charger 65W', 'USBC65', 2, 79.98, 79.98);

-- o27: T-shirt x2
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o27, v_store_id, p_tshirt_m, 'Classic Cotton T-Shirt', 'MTEE01', 2, 49.98, 49.98);

-- o28: MacBook
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o28, v_store_id, p_macbook, 'MacBook Air M3', 'MBA-M3', 1, 1299.00, 1299.00);

-- o29: Dress
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o29, v_store_id, p_dress_w, 'Summer Floral Dress', 'WDRS01', 1, 79.99, 79.99);

-- o30: Samsung
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o30, v_store_id, p_samsung, 'Samsung Galaxy S24', 'SGS24', 1, 849.00, 849.00);

-- o31: Skillet + Lamp
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o31, v_store_id, p_pan, 'Cast Iron Skillet 12"', 'KPAN01', 1, 44.99, 44.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o31, v_store_id, p_lamp, 'Modern Table Lamp', 'DLMP01', 1, 59.99, 59.99);

-- o32: Jacket
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o32, v_store_id, p_jacket_m, 'Wool Blend Jacket', 'MJKT01', 1, 149.99, 149.99);

-- o33: Sneakers + Cushion
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o33, v_store_id, p_sneakers_w, 'Canvas Sneakers', 'WSNK01', 1, 54.99, 54.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o33, v_store_id, p_cushion, 'Velvet Throw Cushion', 'DCSH01', 1, 34.99, 34.99);

-- o34: AirPods (refunded)
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o34, v_store_id, p_airpods, 'AirPods Pro 2', 'APP2', 1, 249.00, 249.00);

-- o35: Lamp (cancelled)
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o35, v_store_id, p_lamp, 'Modern Table Lamp', 'DLMP01', 1, 59.99, 59.99);

-- o36: ThinkPad (refunded)
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o36, v_store_id, p_thinkpad, 'ThinkPad X1 Carbon', 'TPX1C', 1, 1449.00, 1449.00);

-- o37: Jacket + Jeans
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o37, v_store_id, p_jacket_m, 'Wool Blend Jacket', 'MJKT01', 1, 149.99, 149.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o37, v_store_id, p_jeans_m, 'Slim Fit Jeans', 'MJEAN01', 1, 59.99, 59.99);

-- o38: Coffee Maker
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o38, v_store_id, p_coffeemaker, 'Drip Coffee Maker', 'KCOF01', 1, 69.99, 69.99);

-- o39: Blouse
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o39, v_store_id, p_blouse_w, 'Silk Blouse', 'WBLS01', 1, 64.99, 64.99);

-- o40: Blender + Pan
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o40, v_store_id, p_blender, 'Pro Blender 1200W', 'KBLD01', 1, 89.99, 89.99);
INSERT INTO order_items (order_id, store_id, product_id, product_name, sku, quantity, subtotal, total)
VALUES (o40, v_store_id, p_pan, 'Cast Iron Skillet 12"', 'KPAN01', 1, 44.99, 44.99);

-- ─── Sync log to mark seed as a completed sync ──────────────
INSERT INTO sync_logs (store_id, sync_type, status, records_synced, completed_at)
VALUES (v_store_id, 'seed', 'completed', 40, NOW());

-- ─── Update store last_sync_at ───────────────────────────────
UPDATE stores SET last_sync_at = NOW() WHERE id = v_store_id;

RAISE NOTICE 'Seed complete: 10 categories, 20 products, 12 customers, 3 coupons, 40 orders';

END $$;
