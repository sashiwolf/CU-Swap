-- Enable bcrypt for seeding only
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Seed users with valid CU emails (4 letters + 4 digits)
-- Password = Password1!
INSERT INTO users (username, password, email, phone_num, role) VALUES
  ('seedbuyer',  crypt('Password1!', gen_salt('bf')), 'abcd1234@colorado.edu', '1111111100', 'user'),
  ('seedseller', crypt('Password1!', gen_salt('bf')), 'efgh5678@colorado.edu', '2222222200', 'user');

-- Sample listing owned by seedseller
INSERT INTO listings (title, description, price, category, image_url, contact_info)
VALUES ('Graphing Calculator', 'TI-84 Plus CE, gently used', 65.00, 'Electronics', 'https://camo.githubusercontent.com/3cae61090608b8cbd681f5825ca5ac76af8d8d3ee12024926d51c5480aef5d6c/68747470733a2f2f796176757a63656c696b65722e6769746875622e696f2f73616d706c652d696d616765732f696d6167652d313032312e6a7067', 'efgh5678@colorado.edu');

INSERT INTO users_to_listings (user_id, listing_id)
SELECT u.user_id, l.listing_id
FROM users u
JOIN listings l ON l.title = 'Graphing Calculator'
WHERE u.email = 'efgh5678@colorado.edu';

-- Buyer reviews seller
WITH ins_review AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (5, 'Great seller — fast and exactly as described.')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email = 'abcd1234@colorado.edu')  AS reviewer_id,
    (SELECT user_id FROM users WHERE email = 'efgh5678@colorado.edu')  AS reviewee_id
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT ins_review.review_id, ids.reviewer_id, ids.reviewee_id
FROM ins_review, ids;
