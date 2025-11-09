// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************

describe('Server!', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    chai
      .request(server)
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// ********************************************************************************

// Positive + Negative tests for /register
describe('Register', () => {
  it('Positive: creates user and redirects to /login', done => {
    const uniq = Date.now(); // avoid UNIQUE email clashes between runs
    chai
      .request(server)
      .post('/register')
      .redirects(0) // don't follow the redirect
      .send({
        username: 'testinguser' + uniq,
        password: 'test123',
        email: `test${uniq}@colorado.edu`,
        Phone: '9990000001', 
      })
      .end((err, res) => {
        expect(res).to.have.status(302);
        expect(res).to.have.header('location', '/login');
        done();
      });
  });

  it('Negative: missing password redirects back to /register', done => {
    const uniq = Date.now();
    chai
      .request(server)
      .post('/register')
      .redirects(0)
      .send({
        username: 'baduser' + uniq,
        // password missing
        email: `bad${uniq}@colorado.edu`,
        Phone: '9990000001',
      })
      .end((err, res) => {
        expect(res).to.have.status(302);
        expect(res).to.have.header('location', '/register');
        done();
      });
  });
});
