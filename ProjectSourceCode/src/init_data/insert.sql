INSERT INTO users (email, name, role)
VALUES ('mod@gmail.com', 'mod', 'moderator')
ON CONFLICT (email) DO NOTHING;