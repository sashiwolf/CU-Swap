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
app.use(express.static(path.join(__dirname, 'images')));

// *****************************************************
// <!-- Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
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
  app.set('views', path.join(__dirname, 'views'));
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
  
  // *****************************************************
  // <!-- API Routes -->
  // *****************************************************
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
      await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [
        req.body.username,
        hash
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
    if (!req.body.username || !req.body.password) {
        return res.redirect('/login');
    }
    try {
        //get username from database
        const user = await db.oneOrNone('SELECT * FROM users WHERE users.username = $1', [
        req.body.username,
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
        if(match & userRole == 'user')
        {
            //save user details in session 
            req.session.user = user;
            req.session.modTag = false
            req.session.save(() =>{
                res.redirect('/home')
            });
        }
        else if(match & userRole == 'moderator')
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