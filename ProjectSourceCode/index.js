// *****************************************************
// <!-- Import Dependencies -->
// *****************************************************
const dotenv = require('dotenv');
const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const nodemailer = require('nodemailer');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const exphbs = require("express-handlebars");
const Stripe = require("stripe");

// *****************************************************
// <!-- Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'src/views/Layouts'),
  partialsDir: path.join(__dirname, 'src/views/partials'),
});

hbs.handlebars.registerHelper('eq', (a, b) => a === b);

dotenv.config(); 
// database configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST, // the database server
  port: process.env.POSTGRES_PORT, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); 

const fetchListingWithOwner = (listingId) =>
  db.oneOrNone(
    `
      SELECT
        l.listing_id,
        l.title,
        l.description,
        l.price,
        l.category,
        l.image_url,
        l.contact_info,
        l.is_sold,
        utl.user_id AS owner_id
      FROM listings l
      LEFT JOIN users_to_listings utl ON utl.listing_id = l.listing_id
      WHERE l.listing_id = $1
    `,
    [listingId]
  );

const fetchCategories = () =>
  db.any('SELECT categorys AS category FROM category ORDER BY categorys ASC');

const isModeratorUser = (user, session) =>
  !!(session?.modTag || user?.role === 'moderator');

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== '';

const setFlashMessage = (req, type, message) => {
  if (req?.session) {
    req.session.flash = { type, message };
  }
};

const consumeFlashMessage = (req) => {
  if (!req?.session) {
    return null;
  }
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
};

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('Missing email credentials in environment');
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify(err => {
  if (err) console.error('Mail transporter error:', err);
  else console.log('Mail transporter ready');
});



  // *****************************************************
  // <!-- App Settings -->
  // *****************************************************
  
  app.engine('hbs', hbs.engine);
  app.set('view engine', 'hbs');
  app.set('views', path.join(__dirname, 'src/views'));
  app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // initialize session variables
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      saveUninitialized: false,
      resave: false,
    })
  );
  
  app.use(
    bodyParser.urlencoded({
      extended: true,
    })
  );

  // Serve static assets
  app.use('/images', express.static(path.join(__dirname, 'src', 'views', 'Images'))); 
  app.use('/js', express.static(path.join(__dirname, 'src', 'resources', 'js'))); // exposes /js/script.js

  function requireModerator(req, res, next) {
  if (!req.session || req.session.modTag !== true) {
    return res.status(403).send("Forbidden: Admins only.");
  }
  next();
}

  
  // *****************************************************
  // <!-- API Routes -->
  // *****************************************************

  // Dummy API Route for lab 10
  app.get('/welcome', (req, res) => {
    res.json({status: 'success', message: 'Welcome!'});
  });

  app.get('/', (req,res) =>{
    res.render('pages/home', { showAuthButtons: true, hideNav: true});
  });

  app.get('/register', (req, res) => {
    res.render('pages/register', { hideNav: true});
  });

  app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, msg: 'Email required' });

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10min

    // store in session (bind to the email they requested it for)
    req.session.emailVerification = { email, code, expires };

    if(process.env.NODE_ENV !== 'test'){
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your CU Swap Verification Code',
      html: `
        <h2>Verify your CU Swap email</h2>
        <p>Enter this code within 10 minutes:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</div>
      `,
    });
  }
    const payload = {ok: true, msg: 'Code sent!'};
    if (req.get('x-test') === '1'){
      payload.code = code;
    }
    return res.json(payload);
  } catch (err) {
    console.error('send-code error:', err);
    return res.status(500).json({ ok: false, msg: 'Failed to send code' });
  }
});
  


// Register
app.post('/register', async (req, res) => {
   const { email, code, username, password, Phone } = req.body; 

  // helper to produce JSON in tests, normal behavior otherwise
  const fail = (status, reason, fallbackRedirect = '/register') => {
    if (req.get('x-test') === '1') return res.status(status).json({ ok:false, reason });
    return res.redirect(302, fallbackRedirect);
  };

  if (!username || !password || !email || !Phone || !code) {
    return fail(400, 'missing_fields');
  }

  const banned = await db.oneOrNone('SELECT * FROM banned_users WHERE email = $1', [email]);

        if(banned){
          return res.status(400).render('pages/register', {error: true, message: "This email has been restricted access to the website.", hideNav: true});
        }

  const v = req.session.emailVerification;
  if (!v || v.email !== email) return fail(400, 'no_session_or_email_mismatch');
  if (Date.now() > v.expires)  return fail(400, 'expired');
  if (v.code !== code)         return fail(400, 'code_mismatch');

  try {
    const existing = await db.oneOrNone(
      'SELECT 1 FROM users WHERE email=$1 OR username=$2',
      [email, username]
    );
    if (existing) return fail(400, 'duplicate');

    const hash = await bcrypt.hash(password, 10);

    await db.none(
      `INSERT INTO users (username, password, email, phone_num, role, verified)
       VALUES ($1, $2, $3, $4, 'user', true)`,
      [username, hash, email, Phone]
    );

    req.session.emailVerification = null;
    setFlashMessage(req, 'success', 'Account created! You can log in now.');
    return res.redirect(302, '/login');

  } catch (err) {
    console.error('register error:', err);
    return fail(500, 'db_error');
  }
});

  //render login
  app.get('/login', (req, res) => {
    const flash = consumeFlashMessage(req);
    const templateData = { hideNav: true };

    if (flash?.message) {
      templateData.message = flash.message;
      templateData.error = flash.type === 'danger' || flash.type === 'error';
    }

    res.render('pages/login', templateData);
  });

  //login func
  app.post('/login', async (req, res) => {
    //make sure that form isnt empty
    if (!req.body.email || !req.body.password) {
        return res.status(400).render('pages/login', {error: true, message: "Please enter an email and password", hideNav: true});
    }
    try {

        const banned = await db.oneOrNone('SELECT * FROM banned_users WHERE email = $1', [req.body.email]);

        if(banned){
          return res.status(400).render('pages/login', {error: true, message: "This email has been restricted access to the website.", hideNav: true});
        }
        //get username from database
        const user = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [
        req.body.email,
        ]);

        //see if a user was returned
        if (!user) {
            return res.status(400).render('pages/register', {error: true, message: "User does not exist.", hideNav: true});
        }

        // check if password from request matches with password in DB
        const match = await bcrypt.compare(req.body.password, user.password);

        //get mod status
        const userRole = user.role;

        //passwords match and user is not a mod
        if(match && userRole == 'user')
        {
            //save user details in session 
            req.session.user = user;
            req.session.modTag = false
            req.session.save(() =>{
                res.redirect('/discover')
            });
        }
        else if(match && userRole == 'moderator')
        {
            //save user details in session 
            req.session.user = user;
            req.session.modTag = true;
            req.session.save(() =>{
                res.redirect('/discover')
            });
        }
        //passwords dont match
        else
        {
        res.status(400).render('pages/login', {error: true, message: 'Incorrect username or password', hideNav: true});
        }
        
    } catch (err) {
        console.error(err);

        // Redirect back to register page if there’s an error
        res.status(400).render('pages/register', {error: true, message: "There was an error with login, please register", hideNav: true});
    }
  });

// Authentication Middleware.
const auth = (req, res, next) => {
   if (!req.session.user) {
     // Default to login page.
     return res.redirect('/login');
   }
   next();
 };

// // Authentication Required
 app.use(auth);
 
//Admin Checker
 app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.isModerator = !!req.session.modTag; // true/false
  next();
});


//Profile page
app.get('/profile', async (req, res) => {
  try {
    const userInfo = await db.oneOrNone(
      `SELECT username, email, phone_num
       FROM users
       WHERE username = $1`,
      [req.session.user.username]
    );

    if (!userInfo) {
      // No user found
      return res.status(404).render('pages/profile', { error: 'User not found.' });
    }

    res.render('pages/profile', userInfo);
  } catch (err) {
    console.error('Profile route error:', err);
    res.status(500).render('pages/error', { error: 'Could not load profile.' });
  }
});

// Profile update
app.post('/profile', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.user_id;

    const {
      username,
      phone_num,
      currentPassword,
      newPassword,
      confirmPassword
    } = req.body;

    // 1. Load current user from DB (including password hash)
    const currentUser = await db.one(
      `SELECT user_id, username, email, phone_num, password
       FROM users
       WHERE user_id = $1`,
      [userId]
    );

    // 2. Verify current password
    const match = await bcrypt.compare(currentPassword, currentUser.password);
    if (!match) {
      // Password wrong – re-render profile with error
      return res.status(400).render('pages/profile', {
        ...currentUser,
        error: 'Current password is incorrect.'
      });
    }

      // ===== USERNAME UNIQUENESS CHECK =====
    if (username && username !== currentUser.username) {
      const existingUser = await db.oneOrNone(
        `SELECT 1 FROM users
         WHERE username = $1
           AND user_id <> $2`,
        [username, userId]
      );

      if (existingUser) {
        return res.status(400).render('pages/profile', {
          username: currentUser.username,
          email: currentUser.email,
          phone_num: currentUser.phone_num,
          error: 'That username is already taken. Please choose another one.'
        });
      }
    }
    // ===== END USERNAME CHECK =====

    // ===== PHONE UNIQUENESS CHECK =====
    if (phone_num && phone_num !== currentUser.phone_num) {
      const existingPhone = await db.oneOrNone(
        `SELECT 1 FROM users
         WHERE phone_num = $1
           AND user_id <> $2`,
        [phone_num, userId]
      );

      if (existingPhone) {
        return res.status(400).render('pages/profile', {
          username: currentUser.username,
          email: currentUser.email,
          phone_num: currentUser.phone_num,
          error: 'That phone number is already associated with another account.'
        });
      }
    }
    // ===== END PHONE CHECK =====

    // 3. Validate new password if provided
    let newHashedPassword = null;
    if (newPassword && newPassword.trim() !== '') {
      if (newPassword !== confirmPassword) {
        return res.status(400).render('pages/profile', {
          ...currentUser,
          error: 'New password and confirm password do not match.'
        });
      }

      const saltRounds = 10;
      newHashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    // 4. Determine what changed (for UPDATE + email)
    const fields = [];
    const values = [];
    const changes = [];

    let paramIndex = 1; // we’ll build "SET col = $1, col2 = $2" etc

    // Username changed?
    if (username && username !== currentUser.username) {
      fields.push(`username = $${paramIndex++}`);
      values.push(username);
      changes.push(`Username: "${currentUser.username}" → "${username}"`);
    }

    // Phone changed?
    if (phone_num && phone_num !== currentUser.phone_num) {
      fields.push(`phone_num = $${paramIndex++}`);
      values.push(phone_num);
      changes.push(`Phone: "${currentUser.phone_num}" → "${phone_num}"`);
    }

    // Password changed?
    if (newHashedPassword) {
      fields.push(`password = $${paramIndex++}`);
      values.push(newHashedPassword);
      changes.push('Password: updated');
    }

    // If nothing actually changed, just redirect back
    if (fields.length === 0) {
      return res.redirect('/profile');
    }

    // 5. Build and run UPDATE query
    const updateQuery = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING user_id, username, email, phone_num;
    `;
    values.push(userId);

    const updatedUser = await db.one(updateQuery, values);

    // 6. Update session user
    req.session.user = {
      ...req.session.user,
      username: updatedUser.username,
      email: updatedUser.email,
      phone_num: updatedUser.phone_num
      // you can also store password hash again if you want,
      // but usually you don't need it in session
    };

    // 7. Send email about the changes
    const changesText = changes.map(c => `• ${c}`).join('\n');

    await transporter.sendMail({
      from: `"CU Swap" <${process.env.EMAIL_USER}>`,
      to: updatedUser.email,
      subject: 'Your CU Swap profile was updated',
      text: `Hi ${updatedUser.username},

The following changes were made to your CU Swap profile:

${changesText}

If you did not make these changes, please contact support immediately.

– CU Swap Team`
    });

    // 8. Redirect back to profile
    res.redirect('/profile');
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).render('pages/error', { error: 'Could not update profile.' });
  }
});


// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.render('pages/logout', {error: true, message: 'Error logging out. Please try again.' });
    }
    res.render('pages/logout', {error: false, message: 'Logged out Successfully' });
  });
});

// My listings page
app.get('/my-listings', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const flashMessage = req.query.status === 'updated' ? 'Listing updated successfully.' : null;

  try {
    const listings = await db.any(
      `
      SELECT
        l.listing_id,
        l.title,
        l.description,
        l.price,
        l.category,
        l.image_url,
        l.is_sold
      FROM listings l
      JOIN users_to_listings utl ON utl.listing_id = l.listing_id
      WHERE utl.user_id = $1
      ORDER BY l.listing_id DESC
      `,
      [req.session.user.user_id]
    );

    res.render('pages/my_listings', {
      layout: 'main',
      title: 'My Listings',
      listings,
      flashMessage
    });
  } catch (err) {
    console.error('Error loading user listings:', err);
    res.render('pages/my_listings', {
      layout: 'main',
      title: 'My Listings',
      listings: [],
      message: 'Unable to load your listings right now.',
      flashMessage: null
    });
  }
});

// Delete listing
app.post('/listings/:id/delete', async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: 'You must be logged in to delete a listing.' });
  }

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ error: 'Invalid listing id.' });
  }

  try {
    const listing = await fetchListingWithOwner(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const isModerator = isModeratorUser(user, req.session);
    if (!isModerator && listing.owner_id !== user.user_id) {
      return res.status(403).json({ error: 'You can only delete your own listings.' });
    }

    if (listing.is_sold && !isModerator) {
      return res.status(403).json({ error: 'Sold listings cannot be modified.' });
    }

    await db.none('DELETE FROM users_to_listings WHERE listing_id = $1', [listingId]);
    await db.none('DELETE FROM listings WHERE listing_id = $1', [listingId]);

    res.json({ message: 'Listing deleted.' });
  } catch (err) {
    console.error('Error deleting listing:', err);
    res.status(500).json({ error: 'Failed to delete listing.' });
  }
});

// Edit listing form
app.get('/listings/:id/edit', async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/login');
  }

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) {
    return res.status(400).render('pages/error', { message: 'Invalid listing id.' });
  }

  try {
    const listing = await fetchListingWithOwner(listingId);
    if (!listing) {
      return res.status(404).render('pages/error', { message: 'Listing not found.' });
    }

    const isModerator = isModeratorUser(user, req.session);
    const canEdit = isModerator || listing.owner_id === user.user_id;
    if (!canEdit) {
      return res.status(403).render('pages/error', { message: 'You can only edit your own listings.' });
    }

    if (listing.is_sold && !isModerator) {
      return res.status(403).render('pages/error', { message: 'Sold listings cannot be modified.' });
    }

    const categories = await fetchCategories();
    res.render('pages/edit_listing', { listing, categories });
  } catch (err) {
    console.error('Error loading listing for edit:', err);
    res.status(500).render('pages/error', { message: 'Unable to load listing for editing.' });
  }
});

// Update listing
app.post('/listings/:id/edit', async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/login');
  }

  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) {
    return res.status(400).render('pages/error', { message: 'Invalid listing id.' });
  }

  try {
    const listing = await fetchListingWithOwner(listingId);
    if (!listing) {
      return res.status(404).render('pages/error', { message: 'Listing not found.' });
    }

    const isModerator = isModeratorUser(user, req.session);
    const canEdit = isModerator || listing.owner_id === user.user_id;
    if (!canEdit) {
      return res.status(403).render('pages/error', { message: 'You can only edit your own listings.' });
    }

    if (listing.is_sold && !isModerator) {
      return res.status(403).render('pages/error', { message: 'Sold listings cannot be modified.' });
    }

    const updatedTitle = hasValue(req.body.title) ? req.body.title.trim() : listing.title;
    const updatedDescription = hasValue(req.body.description) ? req.body.description : listing.description;
    const updatedCategory = hasValue(req.body.category) ? req.body.category : listing.category;
    const normalizedCategory = (updatedCategory || '').toLowerCase();

    const parsedPrice = Number(req.body.price);
    const updatedPrice =
      hasValue(req.body.price) && !Number.isNaN(parsedPrice)
        ? parsedPrice
        : listing.price;
    const finalPrice = normalizedCategory === 'free' ? 0 : updatedPrice;

    const updatedImage = hasValue(req.body.image_url) ? req.body.image_url : listing.image_url;

    await db.none(
      `
        UPDATE listings
        SET title = $1,
            description = $2,
            price = $3,
            category = $4,
            image_url = $5
        WHERE listing_id = $6
      `,
      [
        updatedTitle,
        updatedDescription,
        finalPrice,
        updatedCategory,
        updatedImage,
        listingId
      ]
    );

    res.redirect('/my-listings?status=updated');
  } catch (err) {
    console.error('Error updating listing:', err);
    try {
      const categories = await fetchCategories();
      res.status(400).render('pages/edit_listing', {
        listing: {
          listing_id: listingId,
          title: updatedTitle,
          description: updatedDescription,
          price: finalPrice,
          category: updatedCategory,
          image_url: updatedImage,
        },
        categories,
        error: 'Unable to update listing. Please try again.'
      });
    } catch (innerErr) {
      console.error('Failed to reload edit form after update error:', innerErr);
      res.status(500).render('pages/error', { message: 'Unable to update listing right now.' });
    }
  }
});

// My Reviews page
app.get('/my-reviews', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.user_id;

    const reviews = await db.any(
      `
      SELECT 
        r.review_id,
        r.actual_review AS content,
        r.rating,
        reviewee.username AS reviewee_username
      FROM reviews r
      JOIN reviews_to_user ru      ON ru.review_id = r.review_id
      JOIN users reviewee          ON reviewee.user_id = ru.reviewee_id
      WHERE ru.reviewer_id = $1
      ORDER BY r.review_id DESC
      `,
      [userId]
    );

    res.render('pages/my-reviews', {
      layout: 'main',
      title: 'My Reviews',
      reviews
    });
  } catch (err) {
    console.error('Error loading reviews:', err);
    res.render('pages/my-reviews', {
      layout: 'main',
      title: 'My Reviews',
      reviews: [],
      message: 'Could not load your reviews.'
    });
  }
});

// Delete a review
app.delete('/delete-review/:id', async (req, res) => {
  const review_id = req.params.id;
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: true, message: 'You must be logged in to delete a review.' });
  }

  try {
    // Moderators can delete any review
    if (user.role === 'moderator') {
      await db.none('DELETE FROM reviews_to_user WHERE review_id = $1', [review_id]);
      await db.none('DELETE FROM reviews WHERE review_id = $1', [review_id]);
      return res.status(200).json({ message: 'Moderator deleted the review successfully.' });
    }

    // Ensure the logged-in user is the reviewer (author)
    const ownsReview = await db.oneOrNone(
      'SELECT 1 FROM reviews_to_user WHERE review_id = $1 AND reviewer_id = $2',
      [review_id, user.user_id]
    );

    if (!ownsReview) {
      return res.status(403).json({ error: 'You do not have permission to delete this review.' });
    }

    await db.none('DELETE FROM reviews_to_user WHERE review_id = $1', [review_id]);
    await db.none('DELETE FROM reviews WHERE review_id = $1', [review_id]);

    res.status(200).json({ message: 'Review deleted successfully.' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});

app.get('/leave_review', async (req, res) => {
  const sellerId = Number(req.query.sellerId);

  if (!Number.isInteger(sellerId)) {
    return res.status(400).render('pages/leave_review', {
      hideNav: false,
      error: 'Missing seller information. Please access this page from your purchase confirmation.'
    });
  }

  if (!req.session.paidSellers || !req.session.paidSellers[String(sellerId)]) {
    return res.status(403).render('pages/leave_review', {
      hideNav: false,
      error: 'You can only review sellers you have successfully purchased from.'
    });
  }

  try {
    const seller = await db.oneOrNone('SELECT username FROM users WHERE user_id = $1', [sellerId]);
    if (!seller) {
      return res.status(404).render('pages/leave_review', {
        hideNav: false,
        error: 'Seller not found.'
      });
    }

    res.render('pages/leave_review', {
      hideNav: false,
      sellerId,
      sellerUsername: seller.username
    });
  } catch (err) {
    console.error('Error loading seller for review:', err);
    res.status(500).render('pages/leave_review', {
      hideNav: false,
      error: 'Unable to load seller information right now.'
    });
  }
});
app.engine(
    "hbs",
    exphbs.engine({
      extname: ".hbs",
      layoutsDir: path.join(__dirname, "views/Layouts"),
      defaultLayout: "main",
      partialsDir: path.join(__dirname, "views/partials"),
      helpers: {
        formatCurrency: (amount, currency = "usd") => {
          const value = (amount || 0) / 100;
          try{
            return new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: currency.toUpperCase()
            }).format(value);
          } catch {
            return `$${value.toFixed(2)}`;
          }
        }
      }
    })
  );
  app.set("views engine", "hsb");
  app.set("views", path.join(__dirname, "views"));

  // Demo seller (connected account)
  const DEMO_SELLER_ACCOUNT_ID = "acct_1SSNU62fkfKSGVIR"; // needs to be replaced with the acoual account of each person

  app.get("/", (req, res) => {
    res.redirect("/checkout");
  });
 // checkout page - optionally tied to a specific listing
  app.get("/checkout", async (req, res) => {
    const currency = "usd";
    let amount = 2000;
    let description = "Demo item description";
    let itemTitle = "Demo item";
    let sellerAccountId = DEMO_SELLER_ACCOUNT_ID;
    let sellerUserId = null;
    let sellerUsername = null;
    const buyerId = req.session.user?.user_id || null;

    const listingId = Number(req.query.listingId);
    if (Number.isInteger(listingId)) {
      try {
        const listing = await db.oneOrNone(
          `
            SELECT
              l.listing_id,
              l.title,
              l.description,
              l.price,
              l.is_sold,
              u.user_id AS seller_user_id,
              u.username AS seller_name
            FROM listings l
            LEFT JOIN users_to_listings utl ON utl.listing_id = l.listing_id
            LEFT JOIN users u ON u.user_id = utl.user_id
            WHERE l.listing_id = $1
          `,
          [listingId]
        );

        if (listing) {
          if (listing.seller_user_id && buyerId && listing.seller_user_id === buyerId) {
            setFlashMessage(req, 'warning', "You can't buy your own listing.");
            return res.redirect(`/listings/${listingId}`);
          }
          if (listing.is_sold) {
            return res.redirect('/discover?sold=1');
          }
          const priceNumber = Number(listing.price);
          if (!Number.isNaN(priceNumber) && priceNumber > 0) {
            amount = Math.round(priceNumber * 100);
          }

          itemTitle = listing.title || itemTitle;
          description = listing.description || `Purchase of ${listing.title || 'listing'}`;
          if (listing.seller_name) {
            description = `${itemTitle} from ${listing.seller_name}`;
            sellerUsername = listing.seller_name;
          }
          if (listing.seller_user_id) {
            sellerUserId = listing.seller_user_id;
          }
        }
      } catch (err) {
        console.error("Error loading listing for checkout:", err);
      }
    }

    req.session.checkout = {
      listingId: Number.isInteger(listingId) ? listingId : null,
      amount,
      currency,
      sellerAccountId,
      sellerUserId,
      sellerUsername
    };

    res.render("pages/checkout", {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      amount,
      currency,
      sellerAccountId,
      description,
      itemTitle
    });
  });

  app.post("/payments/create-intent", async (req, res) => {
    try {
      const {amount, currency, sellerAccountId } = req.body;
      const listingId = req.session.checkout?.listingId;
      const buyerId = req.session.user?.user_id || null;

      if(!sellerAccountId)
      {
        return res.status(400).json({ error: "Missing sellerAccountID"});
      }
      if (listingId) {
        const listing = await db.oneOrNone(
          `
            SELECT
              l.is_sold,
              utl.user_id AS seller_user_id
            FROM listings l
            LEFT JOIN users_to_listings utl ON utl.listing_id = l.listing_id
            WHERE l.listing_id = $1
          `,
          [listingId]
        );
        if (listing?.seller_user_id && buyerId && listing.seller_user_id === buyerId) {
          return res.status(403).json({ error: "You cannot buy your own listing." });
        }
        if (listing && listing.is_sold) {
          return res.status(409).json({ error: "This item has already been purchased." });
        }
      }
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount, 
          currency,
          automatic_payment_methods: {enabled: true}
        },
        {
          stripeAccount: sellerAccountId // direct charge
        }
      );
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      console.error("Error creating PaymentIntent:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/success", async (req, res) => {
    const { sellerId } = req.query;
    const checkoutContext = req.session.checkout || {};
    const sellerUserId = checkoutContext.sellerUserId || null;
    const sellerUsername = checkoutContext.sellerUsername || null;
    const purchasedListingId = checkoutContext.listingId;

    if (purchasedListingId) {
      try {
        await db.none('UPDATE listings SET is_sold = TRUE WHERE listing_id = $1', [purchasedListingId]);
        checkoutContext.listingId = null;
      } catch (err) {
        console.error('Failed to mark listing as sold:', err);
      }
    }

    if (sellerUserId) {
      if (!req.session.paidSellers) {
        req.session.paidSellers = {};
      }
      req.session.paidSellers[String(sellerUserId)] = true;
    }

    res.render("pages/success", {
      canReview: Boolean(sellerUserId),
      reviewUrl: sellerUserId ? `/leave_review?sellerId=${sellerUserId}` : null,
      sellerUsername
    });
  });


  app.get("/error", (req, res) => {
    res.render("pages/error");
  });

  app.get("/seller/:sellerId/reviews/new", (req, res) => {
    const { sellerId } = req.params;

    if (!req.session.paidSellers || !req.session.paidSellers[String(sellerId)]) {
      return res.status(403).send("You can only leave a review after a successful purchase from this seller.");
    }

    res.redirect(`/leave_review?sellerId=${sellerId}`);
});

app.post('/leave_review', async (req, res) => {
  const { rating, review, sellerId } = req.body;
  const parsedSellerId = Number(sellerId);
  let sellerRow;

  if (!rating || !review || !sellerId) {
    return res.status(400).render('pages/leave_review', {
      error: 'All fields are required.',
      sellerId
    });
  }

  if (!Number.isInteger(parsedSellerId)) {
    return res.status(400).render('pages/leave_review', {
      error: 'Invalid seller information provided.',
      sellerId
    });
  }

  if (!req.session.user || !req.session.user.username) {
    return res.status(401).render('pages/leave_review', {
      error: 'You must be logged in to leave a review.',
      sellerId
    });
  }

  if (!req.session.paidSellers || !req.session.paidSellers[String(parsedSellerId)]) {
    return res.status(403).render('pages/leave_review', {
      error: 'You can only review sellers you have purchased from.',
      sellerId
    });
  }

  try {
    sellerRow = await db.oneOrNone(
      'SELECT user_id, username FROM users WHERE user_id = $1',
      [parsedSellerId]
    );
    if (!sellerRow) {
      return res.status(404).render('pages/leave_review', {
        error: 'Seller not found.',
        sellerId
      });
    }
    
    const sessionRow = await db.oneOrNone(
      'SELECT user_id FROM users WHERE username = $1',
      [req.session.user.username]
    );
    if (!sessionRow) {
      return res.status(404).render('pages/leave_review', {
        error: 'User not found.',
        sellerId
      });
    }
    
    if (sellerRow.user_id === sessionRow.user_id) {
      return res.status(400).render('pages/leave_review', {
        error: 'You cannot leave a review for yourself.',
        sellerId
      });
    }

    const insertedReview = await db.one(
      'INSERT INTO reviews (rating, actual_review) VALUES ($1, $2) RETURNING review_id',
      [rating, review]
    );
    
    await db.none(
      'INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id) VALUES ($1, $2, $3)',
      [insertedReview.review_id, sessionRow.user_id, sellerRow.user_id]
    );

    if (req.session.paidSellers) {
      delete req.session.paidSellers[String(parsedSellerId)];
    }
    if (req.session.checkout && req.session.checkout.sellerUserId === parsedSellerId) {
      req.session.checkout.sellerUserId = null;
      req.session.checkout.sellerUsername = null;
    }

    return res.redirect('/discover');
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).render('pages/leave_review', {
      error: 'Could not save your review.',
      sellerId,
      sellerUsername: sellerRow ? sellerRow.username : undefined
    });
  }
});

// Discover page
app.get('/discover', async (req, res) => {
  try {
    const categoryFilter = req.query.category || null;
    const notice = req.query.notice || null;

    const params = [];
    let listingsQuery = `
      SELECT listing_id, title, price, category, image_url
      FROM listings
    `;

    if (categoryFilter) {
      listingsQuery += `
        WHERE category = $1
          AND is_sold = FALSE
      `;
      params.push(categoryFilter);
    } else {
      listingsQuery += `
        WHERE is_sold = FALSE
      `;
    }

    listingsQuery += `
      ORDER BY listing_id DESC
      LIMIT 50
    `;

    const listings = await db.any(listingsQuery, params);

    const categories = await db.any(`
        SELECT categorys AS category FROM category ORDER BY categorys ASC
      `);
    res.render('pages/discover', { 
      listings,
      categories,
      selectedCategory: categoryFilter,
      notice
    });
  } catch (err) {
    console.error('Error loading listings:', err);
    res.render('pages/discover', { listings: [], notice: req.query?.notice || null });
  }
});

app.post('/listings/:id/admin_delete', requireModerator, async (req, res) => {
  const listingId = req.params.id;
  const reason = req.body.reason;

  try {
    // 1. Get listing title + owner email
    const listing = await db.one(
      `
      SELECT l.listing_id,
             l.title,
             u.email
      FROM listings l
      JOIN users_to_listings ul
        ON ul.listing_id = l.listing_id
      JOIN users u
        ON u.user_id = ul.user_id
      WHERE l.listing_id = $1
      `,
      [listingId]
    );

    // 2. Delete the listing (users_to_listings rows will cascade)
    await db.none(
      'DELETE FROM listings WHERE listing_id = $1',
      [listingId]
    );

    // 3. Email the owner
    await transporter.sendMail({
      from: `"CU Swap" <${process.env.EMAIL_USER}>`,
      to: listing.email,
      subject: 'Your CU Swap listing was removed',
      text: `Hi,

Your listing "${listing.title}" has been removed by a moderator.

Reason: ${reason}

– CU Swap Team`,
    });

    // 4. Back to discover page
    res.redirect('/discover');
  } catch (err) {
    console.error('Error deleting listing:', err);
    res.status(500).send('Error deleting listing');
  }
});

// Listing page
app.get('/listings/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).send('Bad id');
  }

  try {
    const listing = await db.oneOrNone(
      `
        SELECT
          l.listing_id,
          l.title,
          l.description,
          l.price,
          l.category,
          l.image_url,
          l.contact_info,
          l.is_sold,
          u.user_id   AS seller_id,
          u.username  AS seller_name,
          u.email     AS seller_email,
          u.phone_num AS seller_phone
        FROM listings l
        LEFT JOIN users_to_listings utl ON utl.listing_id = l.listing_id
        LEFT JOIN users u ON u.user_id = utl.user_id
        WHERE l.listing_id = $1
      `,
      [id]
    );

    if (!listing) {
      return res.status(404).send('Not found');
    }

    const reviews = await db.any(
      `
        SELECT
          r.review_id,
          r.rating,
          r.actual_review,
          reviewer.username AS reviewer_name
        FROM reviews_to_user rtu
        JOIN reviews r ON r.review_id = rtu.review_id
        JOIN users reviewer ON reviewer.user_id = rtu.reviewer_id
        WHERE rtu.reviewee_id = $1
        ORDER BY r.review_id DESC
      `,
      [listing.seller_id]
    );

    const flash = consumeFlashMessage(req);

    res.render('pages/listing', { listing, reviews, flash });
  } catch (err) {
    console.error('Error loading listing:', err);
    res.status(500).render('pages/error', { message: 'Unable to load listing right now.' });
  }
});





app.get('/create_listing', async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.render('pages/create_listing', { categories });
  } catch (err) {
    console.error('Failed to load categories for create listing:', err);
    res.render('pages/create_listing', { categories: [], error: 'Unable to load categories' });
  }
});



app.post('/create_listing', async (req, res) => {
  console.log(req.body.title);
  console.log(req.body.description);
  console.log(req.body.price);
  console.log(req.body.category);
  console.log(req.body.image_url);
  console.log(req.body.contact_info);
  
  if (!req.session.user || !req.session.user.username) {
    return res.status(401).render('pages/create_listing', {
      error: 'You must be logged in to create a listing.'
    });
  }

  try {
    const { user_id } = await db.one(
      'SELECT user_id FROM users WHERE username = $1',
      [req.session.user.username]
    );

    const normalizedCategory = (req.body.category || '').toLowerCase();
    const price = normalizedCategory === 'free' ? 0 : req.body.price;

    const { listing_id } = await db.one(
      `INSERT INTO listings (title, description, price, category, image_url, contact_info)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING listing_id`,
      [req.body.title, req.body.description, price, req.body.category, req.body.image_url, req.body.contact_info]
    );

    await db.none(
      'INSERT INTO users_to_listings (user_id, listing_id) VALUES ($1,$2)',
      [user_id, listing_id]
    );

    res.redirect('/discover');
  } catch (err) {
    console.error('create_listing failed:', err);
    res.status(400).render('pages/create_listing', {
      error: 'Could not create listing. Please fix the highlighted fields.'
    });
  }
});



app.get("/seller/:sellerId/reviews/new", (req, res) => {
  const { sellerId } = req.params;

  // Require a successful purchase for this seller in this session
  if (!req.session.paidSellers || !req.session.paidSellers[sellerId]) {
    return res.status(403).send("You can only leave a review after a successful purchase from this seller.");
  }

  // Render your review form view
  res.render("pages/leave_review", { sellerId });
});

app.get('/users', requireModerator, async (req, res) => {
  try {
    const users = await db.any(
      `SELECT user_id, username, email, phone_num
       FROM users
       WHERE role = 'user'
       ORDER BY username`
    );

    res.render('pages/users', { users });
  } catch (err) {
    console.error('Error loading users:', err);
    res.status(500).send('Error loading users');
  }
});

app.post('/users/:id/remove', requireModerator, async (req, res) => {
  const userId = req.params.id;

  try {
    await db.tx(async t => {
      // 1. Get the user info before deleting
      const user = await t.one(
        `SELECT user_id, username, email, phone_num
         FROM users
         WHERE user_id = $1`,
        [userId]
      );

      // 2. Add them to banned_users (ignore if somehow already there)
      await t.none(
        `INSERT INTO banned_users (user_id, username, email, phone_num)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.user_id, user.username, user.email, user.phone_num]
      );

      // 3. Delete any reviews they left (reviewer) or received (reviewee)
      await t.none(
        `DELETE FROM reviews
         WHERE review_id IN (
           SELECT review_id
           FROM reviews_to_user
           WHERE reviewer_id = $1
              OR reviewee_id = $1
         )`,
        [userId]
      );

      // 4. Delete any listings they own
      await t.none(
        `DELETE FROM listings
         WHERE listing_id IN (
           SELECT listing_id
           FROM users_to_listings
           WHERE user_id = $1
         )`,
        [userId]
      );

      // 5. Finally, delete the user record itself
      await t.none(
        `DELETE FROM users
         WHERE user_id = $1`,
        [userId]
      );
    });

    res.redirect('/users');
  } catch (err) {
    console.error('Error removing user:', err);
    res.status(500).send('Error removing user');
  }
});






app.engine(
  "hbs",
  exphbs.engine({
    extname: ".hbs",
    layoutsDir: path.join(__dirname, "src/views/Layouts"),
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "src/views/partials"),
    helpers: {
      formatCurrency: (amount, currency = "usd") => {
        const value = (amount || 0) / 100;
        try {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase()
          }).format(value);
        } catch {
          return `$${value.toFixed(2)}`;
        }
      },
      times: function (count, options) {
        let output = "";
        const iterations = Math.max(0, Number(count) || 0);
        for (let i = 0; i < iterations; i += 1) {
          output += options.fn(this);
        }
        return output;
      },
      subtract: (a, b) => (Number(a) || 0) - (Number(b) || 0)
    }
  })
);


app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/views"));
// *****************************************************
// <!-- Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');
