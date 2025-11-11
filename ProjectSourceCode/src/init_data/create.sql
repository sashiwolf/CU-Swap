-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone_num VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  verified BOOLEAN NOT NULL DEFAULT false
);

-- LISTINGS TABLE
CREATE TABLE IF NOT EXISTS listings (
  listing_id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  price NUMERIC(10,2),
  category VARCHAR(50),
  image_url TEXT,
  contact_info VARCHAR(100)
);

-- USERS_TO_LISTINGS TABLE
CREATE TABLE IF NOT EXISTS users_to_listings (
  user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
  listing_id INT REFERENCES listings(listing_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, listing_id)
);

-- REVIEWS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  review_id SERIAL PRIMARY KEY,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  actual_review TEXT
);

-- REVIEWS_TO_USER TABLE
CREATE TABLE IF NOT EXISTS reviews_to_user (
  review_id   INT PRIMARY KEY REFERENCES reviews(review_id) ON DELETE CASCADE,
  reviewer_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- author
  reviewee_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- recipient
  CONSTRAINT reviewer_ne_reviewee CHECK (reviewer_id <> reviewee_id)
);