// server/server.js
const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DBUSER,
    host: '/cloudsql/' + process.env.PROJID + ':us-east4:verbref',
    database: 'verbs',
    password: process.env.DBPASS
});

const {TranslationServiceClient} = require('@google-cloud/translate');
const projectId = process.env.PROJID;
const location = 'global';
const translationClient = new TranslationServiceClient();
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

let jwtCheck = jwt({
    secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: 'https://spanishref.us.auth0.com/.well-known/jwks.json'
    }),
    audience: 'https://api.sr.nathanstewart.me',
    issuer: 'https://spanishref.us.auth0.com/',
    algorithms: ['RS256']
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client ', err)
    process.exit(-1)
})

app.use(express.json());

app.use(cors({origin: 'https://sr.nathanstewart.me', optionsSuccessStatus: 200}));

app.use(jwtCheck);

app.post('/l', (req, res) => {
    const text = req.body.text;
    (async () => {
        // Construct request
        const request = {
            parent: `projects/${projectId}/locations/${location}`,
            content: text,
        };
        // Run request
        const [response] = await translationClient.detectLanguage(request);
        if (response.languages[0].languageCode === "es" || response.languages[0].languageCode === "en") {
            res.send(response.languages[0].languageCode);
        } else {
            res.send('')
        }
    })().catch(err => {res.send(''); throw err; }
    );
});

app.post('/t',(req, res) => {
    const text = req.body.text;
    let source = "", target = "";
    if (req.body.origin === "es") {
        source = "es";
        target = "en";
    } else if (req.body.origin === "en") {
        source = "en";
        target = "es";
    } else {
        res.send('');
        return;
    }
    (async () => {
        const request = {
            parent: `projects/${projectId}/locations/${location}`,
            contents: [text],
            mimeType: 'text/plain', // mime types: text/plain, text/html
            sourceLanguageCode: source,
            targetLanguageCode: target,
        };
        const [response] = await translationClient.translateText(request);
        if (response.translations.length >= 1) {
            res.send(response.translations[0].translatedText);
        } else {
            res.send('');
        }
    })().catch(err => {res.send(''); throw err; });
});

app.post('/c',(req, res) => {
    let verbData = {};
    (async () => {
        let verb = req.body.verb;
        let { rows } = await pool.query('SELECT * FROM infinitive WHERE infinitive = $1', [verb]);
        if (!rows[0]) {
            rows = await pool.query('SELECT * FROM lookup WHERE conjug = $1', [verb]);
            if (!rows.rows[0]) {
                res.send('');
                return;
            } else {
                verbData.performer = rows.rows[0].performer_en;
                verbData.tense = rows.rows[0].mood + ' ' + rows.rows[0].tense;
                verb = rows.rows[0].infinitive;
                rows = await pool.query('SELECT * FROM infinitive WHERE infinitive = $1', [verb]);
                verbData.infinitive = rows.rows[0];
            }
        } else {
            verbData.performer = 'No performer';
            verbData.tense = 'Infinitive';
            verbData.infinitive = rows[0];
        }
        rows = await pool.query('SELECT * FROM pastparticiple WHERE infinitive = $1', [verb]);
        verbData.pastParticiple = rows.rows[0];
        rows = await pool.query('SELECT * FROM verbs WHERE infinitive = $1', [verb]);
        verbData.conjugations = rows.rows;
        res.send(verbData);
    })().catch(err => {
        console.log(err); throw err}
    );
});

app.post('/v',(req, res) => {
    (async () => {
        let verb = req.body.verb;
        let { rows } = await pool.query('SELECT * FROM infinitive WHERE infinitive = $1', [verb]);
        if (!rows[0]) {
            rows = await pool.query('SELECT * FROM lookup WHERE conjug = $1', [verb]);
            if (!rows.rows[0]) {
                res.send('false');
            } else {
                res.send('true');
            }
        } else {
            res.send('true');
        }
    })().catch(err => {throw err}
    );
});

// listen on the port
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
