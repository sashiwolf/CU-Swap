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

// Serve static assets (For the images)
app.use('/images', express.static(path.join(__dirname, 'src', 'views', 'Images')));


// *****************************************************
// <!-- API Routes -->
// *****************************************************
app.get('/', (req, res) => {
  res.render('pages/home', { showAuthButtons: true, hideNav: true });
});

app.get('/register', (req, res) => {
  res.render('pages/register', { hideNav: true });
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
  res.render('pages/login', { hideNav: true });
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
    if (match && userRole == 'user') {
      //save user details in session 
      req.session.user = user;
      req.session.modTag = false
      req.session.save(() => {
        res.redirect('/discover')
      });
    }
    else if (match && userRole == 'moderator') {
      //save user details in session 
      req.session.user = user;
      req.session.modTag = true;
      req.session.save(() => {
        res.redirect('/modHome')
      });
    }
    //passwords dont match
    else {
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
  try {
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

// *****************************************************
// <!-- Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
console.log('Server is listening on port 3000');