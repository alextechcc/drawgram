# Drawgram
A Telegram bot to draw small doodles and send them to people in the Telegram messaging app

_(hosted on google cloud functions & bucket under @drawgramapp on Telegram)_

![Telegram Bot](https://github.com/AklemTech/drawgram/raw/master/pictures/drawgram.png)

This Telegram bot requires no state or storage, and relies on Telegram image caching, and storing state in messages and buttons.

It consists of two parts: the static website used for the html5 canvas, and the nodejs server that responds to image submissions and Telegram webhooks.

The bot works like this:
1. You use @drawgrambot in inline-mode or send the bot /start to be sent the HTML5 'game' drawing app.
2. The bot sends you the special 'game' message with an inline button to launch the drawing webpage. The link has parameters appended to it.

These parameters contain:
- A salt which is simply `Date().getTime()`
- A json payload, encrypted with AES256 then base64 urlencoded, this has:
  - Message ID from Telegram of the 'game' message
  - Chat ID from Telegram of the bot's chat with you
- The game submit token which is added by Telegram (unused)
    
3. The webpage is a simple drawing app I implemented which has two canvasses, the live canvas and the smoothed (virtual) canvas. When you draw on the page, the live canvas draws instantly, but as soon as you let go, the smoothed canvas replaces it. The smoothed canvas uses the curve functions in the canvas API that would otherwise look choppy and add latency if rendered live.

4. To submit, the user presses the check mark and waits for confirmation. The page submits the payload to the /submit endpoint containing the image, the salt, and the payload that the server sent it originally.

5. The node server immediately sends the image from memory as a message to the user.
6. The server, using the cached image ID from the response, edits that message to contain the magic submit button. This special API button will switch into a chat and preload text into inline mode. The text we preload is the raw cached image id from Telegram.
7. When getting an non-empty inline mode string, the bot provides a list of images, which consists of a single image, the string presented to the bot. Since the user has the cached image ID prepopulated, the bot adds that one image ID to a list and returns it back to the Telegram API, and the user can send the cached image.
