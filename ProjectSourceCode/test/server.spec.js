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
describe('Register', function () {
  // allow a little extra time for async steps
  this.timeout(5000);

  it('Positive: creates user and redirects to /login', async function () {
    const agent = chai.request.agent(server);           // preserves session cookies
    const uniq  = Date.now();
    const last4 = String(uniq).slice(-4);               // 4 digits
    const email = `test${last4}@colorado.edu`;          // 4 letters + 4 digits

    // 1) Ask for code (sets session and returns code when X-Test is set)
    const sendResp = await agent
      .post('/send-code')
      .set('X-Test', '1')
      .send({ email });

    sendResp.should.have.status(200);
    const code = sendResp.body.code;                    // available because of X-Test

    // 2) Register with that code using the SAME agent
    const regResp = await agent
      .post('/register')
      .set('X-Test', '1')
      .redirects(0)
      .send({
        username: `testinguser${uniq}`,
        password: 'test123',
        email,
        Phone: '+12345678901',                          // + then 11–15 digits OK
        code
      });

    regResp.should.have.status(302);
    regResp.should.have.header('location', '/login');
  });

  it('Negative: missing password redirects back to /register', function (done) {
    const uniq  = Date.now();
    const last4 = String(uniq).slice(-4);
    const email = `badx${last4}@colorado.edu`;          // 4 letters + 4 digits

    chai
      .request(server)
      .post('/register')
      .redirects(0)
      .send({
        username: 'baduser' + uniq,
        // password missing
        email,
        Phone: '+99900000001',                          // still a valid format
        // code missing
      })
      .end((err, res) => {
        expect(res).to.have.status(302);
        expect(res).to.have.header('location', '/register');
        done();
      });
  });
});

