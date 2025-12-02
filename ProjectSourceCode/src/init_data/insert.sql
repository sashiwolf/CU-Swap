-- Enable bcrypt for seeding only (so we can insert plain passwords here)

-- =========================
-- Users (password = Password1!)
-- =========================
INSERT INTO users (username, password, email, phone_num, role) VALUES
  ('user1', crypt('Password1!', gen_salt('bf')), 'abcd1234@colorado.edu', '1111111100', 'user'),
  ('user2', crypt('Password1!', gen_salt('bf')), 'shbu4101@colorado.edu', '2222222200', 'user'),
  ('user3', crypt('Password1!', gen_salt('bf')), 'ijkl9012@colorado.edu', '3333333300', 'user'),
  ('user4', crypt('Password1!', gen_salt('bf')), 'mnop3456@colorado.edu', '4444444400', 'user'),
  ('user5', crypt('Password1!', gen_salt('bf')), 'qrst7890@colorado.edu', '5555555500', 'user'),
  ('user6', crypt('Password1!', gen_salt('bf')), 'uvwx2345@colorado.edu', '6666666600', 'user');



-- Map:
-- user1 = abcd1234 (buyer)
-- user2 = shbu4101 (seller)
-- user3 = ijkl9012 (seller)
-- user4 = mnop3456 (seller)
-- user5 = qrst7890 (buyer)
-- user6 = uvwx2345 (buyer)

-- =========================
-- Listings (owned by sellers)
-- =========================

-- user2 → Item 1
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  '2017 Subaru Impreza',
  '2017 Subaru Impreza with 75,000 miles. Well maintained and in great condition. Perfect for daily commuting or road trips. Features include all-wheel drive, Bluetooth connectivity, and a spacious interior.',
  10000.00,
  'Transportation',
  'https://content.homenetiol.com/2000292/2143540/0x0/fa2d37cdfa6f4006bfdf85195c546735.jpg',
  'shbu4101@colorado.edu',
  false
);

-- user3 → Item 2
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'Nintendo Switch Console',
  'Nintendo Switch console in excellent condition. Comes with two Joy-Con controllers, dock, and all necessary cables. Perfect for gaming on the go or at home.',
  150.00,
  'Electronics',
  'https://i.ebayimg.com/images/g/MWIAAOSwWxZkrV3-/s-l400.jpg',
  'ijkl9012@colorado.edu',
  false
);

-- user3 → Item 3
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'TI-84 Plus Graphing Calculator',
  'A reliable TI-84 Plus graphing calculator in excellent condition. Perfect for high school and college students. Comes with a protective case.',
  30.00,
  'School Supplies',
  'https://i.ebayimg.com/images/g/x0UAAOSw1MVluVhg/s-l400.jpg',
  'ijkl9012@colorado.edu',
  false
);

-- user4 → Item 4
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'Couch - Modern Style',
  'A comfortable modern-style couch in excellent condition. Perfect for any living room setup.',
  350.00,
  'Furniture',
  'https://i.ebayimg.com/images/g/bv8AAOSwJnllyOqe/s-l1200.jpg',
  'mnop3456@colorado.edu',
  false
);

-- user4 → Item 5
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'Signed Michael Jordan Jersey',
  'Get your hands on this authentic signed Michael Jordan jersey! Perfect for any basketball fan or collector. Worn by MJ himself during his legendary career, this jersey is a must-have memorabilia item. Don''t miss out on the chance to own a piece of basketball history!',
  1000.00,
  'Clothing',
  'https://i.ebayimg.com/images/g/C~AAAOSwteFmw85o/s-l1200.jpg',
  'mnop3456@colorado.edu',
  false
);

-- user2 → Item 6
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'Tickets to CU Basketball Game',
  'Get two tickets to the next CU home basketball game. Great seats near the court!',
  20.00,
  'Tickets',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTdhxQBotFL9RQH0ywESgnjVUxt7iuYUgV1g&s',
  'shbu4101@colorado.edu',
  false
);

-- user4 → Item 7
INSERT INTO listings (title, description, price, category, image_url, contact_info, is_sold)
VALUES (
  'Old TV',
  'A vintage television set from the 1980s. Still works but has some cosmetic wear and tear. Perfect for collectors or retro enthusiasts.',
  0.00,
  'Free',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYkmu5KeiPzQnhyCYKQen8XqLzVMVJGv-Qww&s',
  'mnop3456@colorado.edu',
  false
);

-- =========================
-- Ownership links (users_to_listings)
-- =========================

-- user2 owns all listings that use shbu4101@colorado.edu in contact_info
INSERT INTO users_to_listings (user_id, listing_id)
SELECT u.user_id, l.listing_id
FROM users u
JOIN listings l ON l.contact_info = u.email
WHERE u.email = 'shbu4101@colorado.edu';

-- user3 owns all listings that use ijkl9012@colorado.edu in contact_info
INSERT INTO users_to_listings (user_id, listing_id)
SELECT u.user_id, l.listing_id
FROM users u
JOIN listings l ON l.contact_info = u.email
WHERE u.email = 'ijkl9012@colorado.edu';

-- user4 owns all listings that use mnop3456@colorado.edu in contact_info
INSERT INTO users_to_listings (user_id, listing_id)
SELECT u.user_id, l.listing_id
FROM users u
JOIN listings l ON l.contact_info = u.email
WHERE u.email = 'mnop3456@colorado.edu';


-- =========================
-- Reviews (buyers → sellers)
-- =========================

-- user1 → user2
WITH r1 AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (5, 'Good seller, would buy from again')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email='abcd1234@colorado.edu') AS reviewer_id, -- user1
    (SELECT user_id FROM users WHERE email='shbu4101@colorado.edu') AS reviewee_id  -- user2
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT r1.review_id, ids.reviewer_id, ids.reviewee_id FROM r1, ids;

-- user5 → user2
WITH r2 AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (4, 'Smooth transaction, item as described')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email='qrst7890@colorado.edu') AS reviewer_id, -- user5
    (SELECT user_id FROM users WHERE email='shbu4101@colorado.edu') AS reviewee_id  -- user2
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT r2.review_id, ids.reviewer_id, ids.reviewee_id FROM r2, ids;

-- user6 → user3
WITH r3 AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (3, 'Okay experience, but could be better')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email='uvwx2345@colorado.edu') AS reviewer_id, -- user6
    (SELECT user_id FROM users WHERE email='ijkl9012@colorado.edu') AS reviewee_id  -- user3
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT r3.review_id, ids.reviewer_id, ids.reviewee_id FROM r3, ids;

-- user1 → user4
WITH r4 AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (2, 'This seller was unresponsive and the item arrived late')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email='abcd1234@colorado.edu') AS reviewer_id, -- user1
    (SELECT user_id FROM users WHERE email='mnop3456@colorado.edu') AS reviewee_id  -- user4
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT r4.review_id, ids.reviewer_id, ids.reviewee_id FROM r4, ids;

-- user5 → user4
WITH r5 AS (
  INSERT INTO reviews (rating, actual_review)
  VALUES (1, 'Worst experience ever, do not recommend this seller')
  RETURNING review_id
),
ids AS (
  SELECT
    (SELECT user_id FROM users WHERE email='qrst7890@colorado.edu') AS reviewer_id, -- user5
    (SELECT user_id FROM users WHERE email='mnop3456@colorado.edu') AS reviewee_id  -- user4
)
INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id)
SELECT r5.review_id, ids.reviewer_id, ids.reviewee_id FROM r5, ids;
