// *****************************************************
// <!-- Import Dependencies -->
// *****************************************************
const dontenv = require('dotenv');
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

// *****************************************************
// <!-- Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'src/views/layouts'),
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

  // POST /send-code  -> email a 6-digit code and stash it in the session
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
      return res.render('pages/logout', {error: true, message: 'Error logging out. Please try again.' });
    }
    res.render('pages/logout', {error: false, message: 'Logged out Successfully' });
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
    return res.status(401).json({error: true, message: 'You must be logged in to delete a review.' });
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

// *****************************************************
// <!-- Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');