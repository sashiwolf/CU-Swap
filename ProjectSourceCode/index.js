// *****************************************************
// <!-- Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server
const dotenv = require("dotenv");
const exphbs = require("express-handlebars");
const Stripe = require("stripe");

// *****************************************************
// <!-- Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'src/views/layouts'),
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

  // Serve static assets (For the images)
  app.use('/images', express.static(path.join(__dirname, 'src', 'views', 'Images'))); 

  
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
  
  // Register
  app.post('/register', async (req, res) => {
  
    // Check if username or password is empty
    if (!req.body.username || !req.body.password) {
      return res.redirect('/register');
    }
  
    try {
      //hash the password using bcrypt library
      const hash = await bcrypt.hash(req.body.password, 10);
      
      // To-DO: Insert username and hashed password into the 'users' table
      await db.none('INSERT INTO users (username, password, email, phone_num) VALUES ($1, $2, $3, $4)', [
        req.body.username,
        hash,
        req.body.email,
        req.body.Phone
      ]);
      
  
      // Redirect to login page after successful registration6
      res.redirect('/login');
    } catch (err) {
      console.error(err);
  
      // Redirect back to register page if there’s an error
      res.redirect('/register');
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
        return res.redirect('/login;');
    }
    try {
        //get username from database
        const user = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [
        req.body.email,
        ]);

        //see if a user was returned
        if (!user) {
            return res.redirect('/register');
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
        res.render('pages/login', {
        message: 'Incorrect username or password'
        });
        }
        
    } catch (err) {
        console.error(err);

        // Redirect back to register page if there’s an error
        res.redirect('/register');
    }
  });

// // Authentication Middleware.
// const auth = (req, res, next) => {
//   if (!req.session.user) {
//     // Default to login page.
//     return res.redirect('/login');
//   }
//   next();
// };

// // Authentication Required
// app.use(auth);

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.render('pages/logout', { message: 'Error logging out. Please try again.' });
    }
    res.render('pages/logout', { message: 'Logged out Successfully' });
  });
});

// My Reviews page
app.get('/my-reviews', async (req, res) => {
  try {
    const userId = req.session.user.user_id;
    const reviews = await db.any(`
      SELECT r.review_id, r.content, r.rating
      FROM reviews r
      JOIN reviews_to_user ru ON r.review_id = ru.review_id
      WHERE ru.user_id = $1
      ORDER BY r.review_id DESC
    `, [userId]);

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
    return res.status(401).json({ error: 'You must be logged in to delete a review.' });
  }

  try {
    // Check if the logged-in user is a moderator
    if (user.role === 'moderator') {
      // Mods can delete ANY review
      await db.none('DELETE FROM reviews_to_user WHERE review_id = $1', [review_id]);
      await db.none('DELETE FROM reviews WHERE review_id = $1', [review_id]);
      return res.status(200).json({ message: 'Moderator deleted the review successfully.' });
    }

    // Otherwise, ensure the user owns the review
    const ownsReview = await db.oneOrNone(
      'SELECT 1 FROM reviews_to_user WHERE review_id = $1 AND user_id = $2',
      [review_id, user.user_id]
    );

    if (!ownsReview) {
      return res.status(403).json({ error: 'You do not have permission to delete this review.' });
    }

    // Delete the review for regular user
    await db.none('DELETE FROM reviews_to_user WHERE review_id = $1', [review_id]);
    await db.none('DELETE FROM reviews WHERE review_id = $1', [review_id]);

    res.status(200).json({ message: 'Review deleted successfully.' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});
  app.post('/leave_review', async (req, res) => {
    try{
      //insert review
      const reviewResult = await client.query(
      'INSERT INTO reviews (rating, actual_review) VALUES ($1, $2) RETURNING id',
      [req.body.rating, req.body.review]
    );
    
      const reviewId = reviewResult.rows[0].id;
      await client.query(
        'INSERT INTO reviews_to_user (review_id, user_id) VALUES ($1, $2)',
      [reviewId, req.body.user_id]
    );

    }

    catch (err) {
        console.error(err);

        // Redirect back to listing page if there’s an error
        res.redirect('/listings');
    }
    
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
  app.set("veiw engine", "hsb");
  app.set("views", path.join(__dirname, "veiws"));

  // Demo seller (connected account)
  const DEMO_SELLER_ACCOUNT_ID = "acct_1SSNU62fkfKSGVIR"; // needs to be replaced with the acoual account of each person

  app.get("/", (req, res) => {
    res.redirect("/checkout");
  });
 // checkout out page with fixed amount for now later to be connected to the data base
  app.get("/checkout", (req, res) => {
    const amount = 2000; 
    const currency = "usd"; 

    res.render("checkout", {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      amount,
      currency,
      sellerAccountId: DEMO_SELLER_ACCOUNT_ID,
      description: "Demom item description"
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
    res.render("success");
  });

  app.get("/error", (req, res) => {
    res.render("error");
  });

  
// *****************************************************
// <!-- ADDED: Stripe/Handlebars Override for src/views (keeps existing config) -->
// *****************************************************

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
      }
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