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

dotenv.config(); 
// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); 

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });


  const transporter = nodemailer.createTransport({
  service: 'gmail',
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
    return res.redirect(302, '/login');

  } catch (err) {
    console.error('register error:', err);
    return fail(500, 'db_error');
  }
});

  //render login
  app.get('/login', (req, res) => {
    res.render('pages/login', { hideNav: true});
  });

  //login func
  app.post('/login', async (req, res) => {
    //make sure that form isnt empty
    if (!req.body.email || !req.body.password) {
        return res.status(400).render('pages/login', {error: true, message: "Please enter an email and password", hideNav: true});
    }
    try {
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
                res.redirect('/modHome')
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

app.get('/leave_review', (req, res) => {
  console.log('Session Data:', req.session);
  res.render('pages/leave_review', { hideNav: false });
});
app.engine(
    "hbs",
    exphbs.engine({
      extname: ".hbs",
      layoutsDir: path.join(__dirname, "views/layouts"),
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
              u.username AS seller_name
            FROM listings l
            LEFT JOIN users_to_listings utl ON utl.listing_id = l.listing_id
            LEFT JOIN users u ON u.user_id = utl.user_id
            WHERE l.listing_id = $1
          `,
          [listingId]
        );

        if (listing) {
          const priceNumber = Number(listing.price);
          if (!Number.isNaN(priceNumber) && priceNumber > 0) {
            amount = Math.round(priceNumber * 100);
          }

          itemTitle = listing.title || itemTitle;
          description = listing.description || `Purchase of ${listing.title || 'listing'}`;
          if (listing.seller_name) {
            description = `${itemTitle} from ${listing.seller_name}`;
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
      sellerAccountId
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

      if(!sellerAccountId)
      {
        return res.status(400).json({ error: "Missing sellerAccountID"});
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

  app.get("/success", (req, res) => {
    const { sellerId } = req.query;
    res.render("pages/success", { sellerId, canReview: true });
  });


  app.get("/error", (req, res) => {
    res.render("pages/error");
  });

  app.get("/seller/:sellerId/reviews/new", (req, res) => {
    const { sellerId } = req.params;

    // TODO: optionally look up seller/listing info from DB here

    res.render("pages/leaveReview", { sellerId });
});

app.post('/leave_review', async (req, res) => {
  const { rating, review, username } = req.body;

  if (!rating || !review || !username) {
    return res.status(400).render('pages/leave_review', { error: 'All fields are required.' });
  }

  try {
    //get user_id for provided username
    const userRow = await db.oneOrNone(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );
    if (!userRow) {
      return res.status(404).render('pages/leave_review', { error: 'User not found.' });
    }
    
    //get user_id for current session
    const sessionRow = await db.oneOrNone(
      'SELECT user_id FROM users WHERE username = $1',
      [req.session.user.username]
    );
    if (!sessionRow) {
      return res.status(404).render('pages/leave_review', { error: 'User not found.' });
    }
    
    //check whether user is trying to leave review for themselves. Dont insert and print error message
    if(userRow.user_id == sessionRow.user_id)
    {
      return res.status(404).render('pages/leave_review', { error: 'You cannot leave a review for yourself' });
    }

    //insert into review
    const insertedReview = await db.one(
      'INSERT INTO reviews (rating, actual_review) VALUES ($1, $2) RETURNING review_id',
      [rating, review]
    );
    
    
    //insert join table
    await db.none(
      'INSERT INTO reviews_to_user (review_id, reviewer_id, reviewee_id) VALUES ($1, $2, $3)',
      [insertedReview.review_id, sessionRow.user_id, userRow.user_id]
    );

    res.render('pages/leave_review', { success: 'Review submitted!' });
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).render('pages/leave_review', { error: 'Could not save your review.' });
  }
});

// Discover page
app.get('/discover', async (req, res) => {
  try {
    const listings = await db.any(`
      SELECT listing_id, title, price, category, image_url
      FROM listings
      ORDER BY listing_id DESC
      LIMIT 50
    `);

    res.render('pages/discover', { listings });
  } catch (err) {
    console.error('Error loading listings:', err);
    res.render('pages/discover', { listings: [] });
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

    res.render('pages/listing', { listing, reviews });
  } catch (err) {
    console.error('Error loading listing:', err);
    res.status(500).render('pages/error', { message: 'Unable to load listing right now.' });
  }
});





app.get('/create_listing', (req, res) => {
  res.render('pages/create_listing'); 
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

    const { listing_id } = await db.one(
      `INSERT INTO listings (title, description, price, category, image_url, contact_info)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING listing_id`,
      [req.body.title, req.body.description, req.body.price, req.body.category, req.body.image_url, req.body.contact_info]
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




app.engine(
  "hbs",
  exphbs.engine({
    extname: ".hbs",
    layoutsDir: path.join(__dirname, "src/views/layouts"),
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
