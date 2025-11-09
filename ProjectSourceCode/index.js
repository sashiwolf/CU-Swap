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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// *****************************************************
// <!-- Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'src/views/Layouts'),
  partialsDir: path.join(__dirname, 'src/views/partials'),
});


// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

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
  
// Register
app.post('/register', async (req, res) => {
  // accept any of these keys for phone (form/tests can vary)
  const phone =
    req.body.phone ??
    req.body.phone_num ??
    req.body.Phone ?? null;

  // required fields
  if (!req.body.username || !req.body.password || !req.body.email || !phone) {
    return res.redirect(302, '/register');
  }

  try {
    // hash the password using bcrypt
    const hash = await bcrypt.hash(req.body.password, 10);

    // Insert user
    await db.none(
      'INSERT INTO users (username, password, email, phone_num) VALUES ($1, $2, $3, $4)',
      [req.body.username, hash, req.body.email, phone]
    );

    // Success → login
    return res.redirect(302, '/login');
  } catch (err) {
    console.error(err);
    // For tests, just redirect back to register on any error
    return res.redirect(302, '/register');
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
  res.render('pages/leave_review', { hideNav: true });
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

//Discover page
app.get('/discover', async (req, res) => {
  try {
    const listings = await db.any(`
        SELECT title, price, category, image_url
        FROM listings
        LIMIT 50
    `);

    res.render('pages/discover', { listings });
  } catch (err) {
    console.error();
  }
});

// *****************************************************
// <!-- Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');
