require('dotenv').config();

const express = require('express')
const flash = require('connect-flash')
const loggedin = require('connect-ensure-login')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const DuoStrategy = require('./lib').Strategy


const users = [
    { id: 1, username: 'bob', password: 'secret', email: 'bob@example.com' },
    { id: 2, username: 'joe', password: 'birthday', email: 'joe@example.com' }
];

const keys = {}

function findById(id, fn) {
  const idx = id - 1;
  if (users[idx]) {
    fn(null, users[idx]);
  } else {
    fn(new Error('User ' + id + ' does not exist'));
  }
}

function findByUsername(username, fn) {
  for (let i = 0, len = users.length; i < len; i++) {
    const user = users[i];
    if (user.username === username) {
      return fn(null, user);
    }
  }
  return fn(null, null);
}

function findKeyForUserId(id, fn) {
  return fn(null, keys[id]);
}

function saveKeyForUserId(id, key, fn) {
  keys[id] = key;
  return fn(null);
}


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  findById(id, function (err, user) {
    done(err, user);
  });
});


// Use the LocalStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a username and password), and invoke a callback
//   with a user object.  In the real world, this would query a database;
//   however, in this example we are using a baked-in set of users.
passport.use(new LocalStrategy(function(username, password, done) {
    process.nextTick(function () {
      // Find the user by username.  If there is no user with the given
      // username, or the password is not correct, set the user to `false` to
      // indicate failure and set a flash message.  Otherwise, return the
      // authenticated `user`.
      findByUsername(username, function(err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false, { message: 'Invalid username or password' }); }
        if (user.password != password) { return done(null, false, { message: 'Invalid username or password' }); }
        return done(null, user);
      })
    });
  }));

const ikey = process.env.I_KEY;
const skey = process.env.S_KEY;;
const host = process.env.HOST;;
const loginUrl = '/login-duo';

passport.use(new DuoStrategy(ikey, skey, host, loginUrl));


const app = express();

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs-locals'));
  app.use(express.static(__dirname + '/js'));
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: 'keyboard cat' }));
  app.use(flash());
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
});


app.get('/', function(req, res){
  res.render('index', { user: req.user });
});

// To view account details, user must be authenticated using two factors
app.get('/account', loggedin.ensureLoggedIn(), ensureSecondFactor, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user, message: req.flash('error') });
});

app.get('/login-duo', loggedin.ensureLoggedIn(), function(req, res, next) {
  res.render('login-duo', {user: req.user, host: req.query.host,
    post_action: req.query.post_action, sig_request: req.query.signed_request});
});

// POST /login
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
//
//   curl -v -d "username=bob&password=secret" http://127.0.0.1:3000/login
app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login', failureFlash: true }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/auth-duo', loggedin.ensureLoggedIn(),
    passport.authenticate('duo', { failureRedirect: '/auth-duo', failureFlash: true }),
    function(req, res, next) {
    return next();
  });

app.post('/auth-duo',
  passport.authenticate('duo', { failureRedirect: '/auth-duo', failureFlash: true }),
  function(req, res) {
    req.session.secondFactor = 'duo';
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(3000, function() {
  console.log('Express server listening on port 3000');
});


function ensureSecondFactor(req, res, next) {
  if (req.session.secondFactor == 'duo') { return next(); }
  res.redirect('/auth-duo')
}
