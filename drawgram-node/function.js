const config     = require('./config.json'),
      Telegraf   = require('telegraf'),
      Extra      = require('telegraf/extra'),
      Markup     = require('telegraf/markup'),
      express    = require('express'),
      bodyParser = require('body-parser'),
      base64url  = require('base64-url')
      aes256     = require('aes256'),
      fs         = require('fs'),
      cors       = require('cors'),
      Busboy     = require('busboy');

const app    = express(),
      bot    = new Telegraf(config.BOT_TOKEN);

/* ------ Fill in broken multer ----- */

// From G. Rodriques https://stackoverflow.com/questions/47242340/how-to-perform-an-http-file-upload-using-express-on-cloud-functions-for-firebase#
function multipart(req, res, next) {
    if (!(req.method === 'POST') || !req.headers['content-type'].startsWith('multipart/form-data'))
        next();

    const busboy = new Busboy({headers: req.headers});

    req.files = {};

    busboy.on('field', (fieldname, value) => {
        req.body[fieldname] = value;
    });

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        let fileBuffer = new Buffer('');
        file.on('data', (data) => {
            fileBuffer = Buffer.concat([fileBuffer, data]);
        });

        file.on('end', () => {
            req.files[fieldname] = {
                fieldname,
                'originalname': filename,
                encoding,
                mimetype,
                buffer: fileBuffer
            };
        });
    });

    busboy.on('finish', () => {
        next();
    });

    busboy.end(req.rawBody);
    req.pipe(busboy);
};

/* ------ Telegram Bot Side ------ */

bot.catch((err) => {
    console.log('Telegram error: ', err);
});

bot.start((ctx) => {
    const gameMarkup = Extra.markup(Markup.inlineKeyboard([
        Markup.gameButton('\uD83D\uDD8C Start drawing')
    ]));
    return ctx.replyWithGame(config.GAME_SHORT_NAME, gameMarkup);
});

bot.gameQuery(async (ctx) => {
    const msgID = ctx.update.callback_query.message.message_id,
          chatID = ctx.chat.id,
          salt = new Date().getTime(),
          key = config.SECRET + salt,
          plaintext = JSON.stringify({chatID: chatID, msgID: msgID}),
          payload = base64url.escape(aes256.encrypt(key, plaintext));

    ctx.answerGameQuery(config.STATIC_URL
                        + '#payload=' + payload
                        + '&salt=' + salt);
});

bot.on('inline_query', async (ctx) => {
    results = (ctx.inlineQuery.query) ?
        [{
            type: 'photo',
            id: 'abc',
            photo_file_id: ctx.inlineQuery.query,
        }] : [];
    return ctx.answerInlineQuery(results, {
        switch_pm_text: 'Create a new doodle',
        switch_pm_parameter: 'newdrawing',
    });
});

/* ------ Express Side ------ */
app.use(cors(config.CORS_OPTIONS));

app.post(config.CALLBACK_PATH, async (req, res) => {
    bot.handleUpdate(req.body, res);
});

app.post('/submit', multipart, async (req, res) => {
    if (!req.body
        || !('files' in req)
        || !('payload' in req.body)
        || !('salt' in req.body))
        return res.status(400).send('Missing Field in POST\n');

    if (!('drawing' in req.files))
        return res.status(400).send('Missing Drawing\n');

    const salt      = req.body.salt,
          payload   = req.body.payload,
          key       = config.SECRET + salt,
          plaintext = aes256.decrypt(key, base64url.unescape(payload)),
          params    = JSON.parse(plaintext);

    if (!('chatID' in params)
        || !('msgID' in params))
        return res.status(400).send('Missing Field\n');

    try {
        await bot.telegram.deleteMessage(params.chatID, params.msgID);
    } catch(err) {
        if (err.code == 400) {
            return res.status(400).send('Image Already Submitted\n');
        }
    }

    const imgBuf     = req.files['drawing'].buffer,
          photoMsg   = await bot.telegram.sendPhoto(params.chatID, {source: imgBuf}),
          fileID     = photoMsg.photo[photoMsg.photo.length - 1].file_id,
          photoMsgID = photoMsg.message_id;

    const editMarkup = Extra.markup(Markup.inlineKeyboard([
        Markup.switchToChatButton('Publish to chat', fileID)
    ]));

    await bot.telegram.editMessageCaption(params.chatID, photoMsgID, undefined, '', editMarkup);

    return res.status(202).end();
});

app.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).send('Something broke!\n')
})

bot.telegram.setWebhook(config.API_URL + config.CALLBACK_PATH);
console.log("Ready!")

module.exports = { app };
