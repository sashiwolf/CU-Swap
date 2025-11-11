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
  it('Positive: creates user and redirects to /login', async () => {
  const agent = chai.request.agent(server);    // preserves session cookies
  const uniq  = Date.now();
  const email = `test${uniq}@colorado.edu`;

  // 1) Ask for code (sets session and returns code when X-Test is set)
  const sendResp = await agent
    .post('/send-code')
    .set('X-Test', '1')
    .send({ email });
  sendResp.should.have.status(200);
  const code = sendResp.body.code; // <-- available because of X-Test

  // 2) Register with that code using the SAME agent
  const regResp = await agent
    .post('/register')
    .set('X-Test', '1')
    .redirects(0)
    .send({
      username: `testinguser${uniq}`,
      password: 'test123',
      email,
      Phone: '1111111111',      
      code
    });

  regResp.should.have.status(302);
  regResp.should.have.header('location', '/login');
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
        Phone: '1111111111',
        // code missing
      })
      .end((err, res) => {
        expect(res).to.have.status(302);
        expect(res).to.have.header('location', '/register');
        done();
      });
  });
});
