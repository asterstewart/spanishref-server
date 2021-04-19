// server/server.js
const express = require('express');
const cors = require('cors');
const app = express();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DBUSER,
    host: process.env.DBIP,
    database: 'verbs',
    password: process.env.DBPASS
});
const {TranslationServiceClient} = require('@google-cloud/translate');
const projectId = process.env.PROJID;
const location = 'global';
const translationClient = new TranslationServiceClient();

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

var corsOptions = {
  origin: 'https://sr.nathanstewart.me',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

app.get('/l/:text', cors(corsOptions), (req, res, next) => {
    const text = req.params.text;
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

app.get('/t/:origin/:text', cors(corsOptions), (req, res, next) => {
    const text = req.params.text;
    let source = "", target = "";
    if (req.params.origin === "es") {
        source = "es";
        target = "en";
    } else if (req.params.origin === "en") {
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

app.get('/c/:verb', cors(corsOptions), (req, res, next) => {
    let verbData = {};
    (async () => {
        let verb = req.params.verb;
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
    })().catch(err => {throw err}
    );
});

app.get('/v/:verb', cors(corsOptions), (req, res, next) => {
    (async () => {
        let verb = req.params.verb;
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
