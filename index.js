'use strict'

const bodyParser = require('body-parser')
const express = require('express')
const expressApp = express()
const fs = require('fs');
const gm = require('gm').subClass({
  imageMagick: true
});
const http = require('http');
const imgur = require('imgur');
const request = require('request');

const MAX_CARDS_IN_HSCROLL = 10;

// Strings
const SEARCH_MEMES_MESSAGE = 'To search for memes, you can use #search #meme_type\n\nIf you want to search for memes and apply text, ' +
  'you can use #search #meme_type #top_text #bot_text, replacing top_text and bot_text with whatever you please! (or set top_text or bot_text to NONE if you want to ignore one of them)\n\nExample: #search #harambe #i am #always watching';
const GET_STARTED_MESSAGE = "Welcome to memeify. Use the menu on the left hand side to get started, or just upload an image you're ready to memeify!";
const UPLOAD_IMAGE_MESSAGE = "To use your own custom image, simply send the image to us as a message, and we'll help you memeify it.\n\nIf you're on web, you can attach the image " +
  "and type #upload #top_text #bot_text before sending, and we'll mememify it for you in one step (set top_text or bot_text to NONE if you want to ignore one of them). See #advanced to learn how to stack 2 images.";
const HELP_MESSAGE_1 =
  "Welcome! " +
  "To search for memes, type '#search #meme_name' (without quotes)\n\n" +
  "You can also apply custom text to the memes you search for " +
  "by typing '#search #meme_name #top_text #bot_text' (put NONE as top_text or bot_text to ignore).\n\n";
const HELP_MESSAGE_2 =
  "You can even upload your own image, and we'll walk you through the process of memeifying it! If you've got the hang of it, type #advanced for more commands.-Memeify";
const HELP_MESSAGE_3 = "Now here's an example! (NOTE there are no quotes). Also, don't forget to get the image and share it with your friends! -Memeify";
const HELP_MESSAGE_4 = "#search #lebron james #i am #the goat";
const ADVANCED_MESSAGE_1 =
  "So we have a few more options for your meme dreams.\n\n" +
  "For starters, you can type '#popular' to see what are the current trending memes" +
  " (that include text) within the last 30 days, and if you just want " +
  "the popular memes that include text for a specific type, simply try '#popular #meme_type'.\n" +
  "If you're not into text, you can discover current trending templates through '#discover'. -Memeify\n\n";
const ADVANCED_MESSAGE_2 =
  "If you're trying to memeify through a link, you can use '#link #<url> #top_text #bot_text' (note: #link is the command, replace <url> with your meme's url), and we'll memeify it for you.\n\n" +
  "Also, if you're on web, you can attach an image, and before sending it you can add '#upload #top_text #bot_text', " +
  "and we'll memeify it for you in one step instead of the usual two step process. " +
  "You can also upload two pictures at the same time (on web) using the same '#upload #top_text #bot_text' command, and we'll " +
  "stack the two images on top of each other and apply the text to the stacked image. -Memeify";
const PAYLOAD_MESSAGE = 'Copy/paste following to memeify the image, replacing top_text and bot_text with anything you want (or set top_text or bot_text to NONE if you want to ignore one of them)! Type #help for a specific example\n\n';
const GENERIC_ERROR_MESSAGE = 'Sorry, I couldnt understand your request. ' +
  'Type #help for information on how to use the bot.';
const PROCESSING_REQUEST_MESSAGE = 'Request received! Processing...';

expressApp.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
expressApp.use(bodyParser.urlencoded({extended: false}))

// Process application/json
expressApp.use(bodyParser.json())

// Index route
expressApp.get('/', function (req, res) {
  res.send('Hello world, I am a chat bot');
})

// for Facebook verification
expressApp.get('/webhook/', function (req, res) {
  if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
    res.send(req.query['hub.challenge']);
  }
  res.send('Error, wrong token');
})

// Spin up the server
expressApp.listen(expressApp.get('port'), function() {
  imgur.setCredentials(process.env.USERNAME, process.env.PASSWORD, process.env.CLIENTID);
  console.log('running on port', expressApp.get('port'));
})

expressApp.post('/webhook/', function (req, res) {
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      sendTextMessage(sender, PROCESSING_REQUEST_MESSAGE);
      let text = event.message.text.trim();
      if (text.indexOf('-Memeify') === -1) {
        const inputQuery = text.split('#');
        inputQuery.shift();
        if (text.toLowerCase().indexOf('#search') > -1) {
          if (inputQuery.length === 4) {
            // Search for meme then apply custom text to it
            let typeText = extractInfoFromInputQuery(inputQuery, 1);
            let topText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 2));
            let botText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 3));
            getGeneratorIDFromQueryType(sender, typeText, topText, botText, false);
          } else if (inputQuery.length === 2) {
            // Search for memes templates related to the query
            let typeText = extractInfoFromInputQuery(inputQuery, 1);
            getGeneratorIDFromQueryType(sender, typeText, null, null, false);
          }
        } else if (text.toLowerCase().indexOf('#popular') > -1) {
          if (inputQuery.length === 2) {
            // We have specified that we're looking for popular memes (instances)
            // pertaining to a specific type
            let typeText = extractInfoFromInputQuery(inputQuery, 1);
            getGeneratorIDFromQueryType(sender, typeText, null, null, true);
          } else {
            // We just want popular instances of memes, regardless of the type
            sendPopularMemesFromSpecificType(sender, null);
          }
        } else if (text.toLowerCase().indexOf('#link') > -1) {
          let linkText = extractInfoFromInputQuery(inputQuery, 1);
          let topText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 2));
          let botText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 3));
          getCustomMemeFromLink(sender, topText, botText, linkText);
        } else if (text.toLowerCase().indexOf('#upload') > -1 && event.message.attachments) {
          let topText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 1));
          let botText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 2));
          if (event.message.attachments.length === 1) {
            const attachedURL = event.message.attachments[0].payload.url;
            uploadImage(sender, attachedURL1, topText, botText);
          } else if (event.message.attachments.length === 2) {
            const attachedURL1 = event.message.attachments[0].payload.url;
            const attachedURL2 = event.message.attachments[1].payload.url;
            uploadStackedImages(sender, attachedURL1, attachedURL2, topText, botText);
          }
        } else if (text.toLowerCase().indexOf('#discover') > -1) {
          sendTrendingTemplates(sender)
        } else if (text.toLowerCase().indexOf('#help') > -1) {
          sendHelpMessage(sender);
        } else if (text.toLowerCase().indexOf('#advanced') > -1) {
          sendAdvancedMessage(sender);
        } else {
          sendTextMessage(sender, GENERIC_ERROR_MESSAGE);
        }
      }
    } else if (event.message && event.message.attachments
      && event.message.attachments.length > 0
      && event.message.attachments[0].payload !== null
      && event.message.attachments[0].payload.url !== undefined
      && event.message.attachments[0].payload.url !== null
    ) {
      // We are uploading an image only
      uploadRawImage(sender, event.message.attachments[0].payload.url);
    } else if (event.postback) {
      if (event.postback.payload.indexOf('-Memeify') > -1) {
        let payloadLink = event.postback.payload.replace('-Memeify', '');
        sendPayloadMessage(sender, payloadLink);
      } else if (event.postback.payload.indexOf('HELP') > -1) {
        sendHelpMessage(sender);
      } else if (event.postback.payload.indexOf('ADVANCED') > -1) {
        sendAdvancedMessage(sender);
      } else if (event.postback.payload.indexOf('SEARCH') > -1) {
        sendTextMessage(sender, SEARCH_MEMES_MESSAGE);
      } else if (event.postback.payload.indexOf('UPLOAD') > -1) {
        sendTextMessage(sender, UPLOAD_IMAGE_MESSAGE);
      } else if (event.postback.payload.indexOf('GET_STARTED') > -1) {
        sendTextMessage(sender, GET_STARTED_MESSAGE);
      } else {
        sendImageAttachment(sender, event.postback.payload);
      }
    }
  }
  res.sendStatus(200)
})

function uploadImage(sender, attachedURL, topText, botText) {
  imgur.uploadUrl(attachedURL)
    .then(function (json) {
      getCustomMemeFromLink(sender, topText, botText, json.data.link);
    }
  )
}

function uploadStackedImages(sender, attachedURL1, attachedURL2, topText, botText) {
  let imageInputLen = 2;
  let attachedImages = [attachedURL1, attachedURL2];
  let uploadedImagesLink = [];
  function postAttachmentsUpload(uploadedImagesLink) {
    let download = function(uri, filename, callback) {
      request.head(uri, function(err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
      });
    };
    const firstImageName = '' + sender + '1.png';
    const secondImageName = '' + sender + '2.png';
    const thirdImageName = '' + sender + '3.png'
    download(uploadedImagesLink[0], firstImageName, function() {
      download(uploadedImagesLink[1], secondImageName, function() {
        gm(firstImageName).append(secondImageName)
          .write(thirdImageName, function (err) {
            if (!err) {
              imgur.uploadFile(thirdImageName)
                .then(function (json) {
                  getCustomMemeFromLink(sender, topText, botText, json.data.link);
                }
              )
            }
          }
        );
      });
    });
  }
  (function uploadImages(i, imageInputLen, attachedImages, uploadedImagesLink, callback) {
    if (i < imageInputLen) {
      const currAttachedURL = attachedImages[i];
      imgur.uploadUrl(currAttachedURL)
        .then(function (json) {
          uploadedImagesLink.push(json.data.link);
          uploadImages(i + 1, imageInputLen, attachedImages, uploadedImagesLink, callback)
        }
      )
    } else {
      callback(uploadedImagesLink);
    }
  })(0, imageInputLen, attachedImages, uploadedImagesLink, postAttachmentsUpload)
}

/*
 * Since FB's CDN can't be used with the API I'm using (since it's not a publically
 * distributable image), I need to upload it to imgur to get a permanent link, and
 * then we can use the provided open source meme generator API from that link
 */
function uploadRawImage(sender, imageUrl) {
  const uploadedImageName = '' + sender + '.png';
  let download = function(uri, filename, callback) {
    request.head(uri, function(err, res, body) {
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
  };
  download(imageUrl, uploadedImageName, function() {
    imgur.uploadFile(uploadedImageName)
      .then(function (json) {
        const link = json.data.link;
        const element = [{
          "title": "Your Image",
          "image_url": link,
          "buttons": [
            getPayloadButton(
              "Add Text",
              "#link #" + link + " #top_text #bot_text-Memeify",
            ),
            getPayloadButton("Get Image", "" + link),
          ],
        }];
        sendImagesAsMessage(sender, element);
      }
    );
  });
}

function extractInfoFromInputQuery(inputQuery, infoIndex) {
  return inputQuery[infoIndex].trim();
}

function sanitizeMemeText(text) {
  return text === 'NONE' ? null : text;
}

function sendPopularMemesFromSpecificType(sender, memes) {
  let url;
  if (memes) {
    url =
      'http://version1.api.memegenerator.net/Instances_Select_ByPopular?'
        + 'languageCode=en'
        + '&urlName=' + memes[0].urlName;
  } else {
    url =
      'http://version1.api.memegenerator.net/Instances_Select_ByPopular?'
        + 'languageCode=en';
  }
  request(
    url,
    (function (error, response, body) {
      let images = [];
      if (!error && response.statusCode == 200) {
        const result = JSON.parse(body).result;
        const maxIterations = result.length > MAX_CARDS_IN_HSCROLL
          ? MAX_CARDS_IN_HSCROLL
          : result.length;
        for (let i = 0; i < maxIterations; i++) {
          const currElement = {
            "title": result[i].displayName,
            "image_url": result[i].instanceImageUrl,
            "buttons": [
              getPayloadButton("Get Image", result[i].instanceImageUrl),
            ],
          }
          images.push(currElement);
        }
      }
      sendImagesAsMessage(sender, images);
    }
  ))
}

function getCustomMemeFromLink(sender, topText, botText, link) {
  const customLinkImgUrl =
    'https://memegen.link/custom/'
      + (topText !== null ? topText + '/' : '')
      + (botText !== null ? botText + '/' : '')
      + '.jpg?'
      + 'font=impact'
      + '&alt=' + link;
  sendMemeifiedImage(sender, customLinkImgUrl)
}

function getGeneratorIDFromQueryType(sender, typeText, topText, botText, showInstances) {
  request(
    'http://version1.api.memegenerator.net/Generators_Search?'
    + 'q=' + typeText,
    (function (error, response, body) {
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        if (topText !== null || botText !== null) {
          sendCustomMemeFromPopular(sender, result, topText, botText);
        } else {
          if (showInstances) {
            sendPopularMemesFromSpecificType(sender, result);
          } else {
            sendMemeFromPopularQuery(sender, result, typeText);
          }
        }
      }
    })
  )
}

function sendMemeifiedImage(sender, imageURL) {
  let messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "Your customized meme",
          "image_url": imageURL,
          "buttons": [
            getPayloadButton("Get Image", imageURL),
          ],
        }]
      }
    }
  };
  request(getRequestParams(sender, messageData));
}

function sendMemeFromPopularQuery(sender, result, typeText) {
  var images = [];
  var imageInfo = [];
  const maxIterations = result.length > MAX_CARDS_IN_HSCROLL
    ? MAX_CARDS_IN_HSCROLL
    : result.length;
  for (let i = 0; i < maxIterations; i++) {
    imageInfo.push({
      "urlName": result[i].urlName,
      "generatorID": result[i].generatorID
    });
  }
  function showImages(images) {
    sendImagesAsMessage(sender, images);
  }
  (function getImages(i, iterations, images, imageInfo, callback) {
    if (i < iterations) {
      request(
        'http://version1.api.memegenerator.net/Generator_Select_ByUrlNameOrGeneratorID?'
        + 'generatorID=' + imageInfo[i].generatorID
        + '&urlName=' + imageInfo[i].urlName,
        (function (error, response, body) {
          if (!error && response.statusCode == 200) {
            let memeResult = JSON.parse(body).result;
            const currElement = {
              "title": memeResult.displayName,
              "image_url": memeResult.imageUrl,
              "buttons": [
                getPayloadButton(
                  "Add Text",
                  "#search #" + typeText + " #top_text #bot_text-Memeify",
                ),
                getPayloadButton("Get Image", memeResult.imageUrl),
              ],
            }
            images.push(currElement);
            getImages(i + 1, iterations, images, imageInfo, callback);
          }
        }
      )
    )} else {
      callback(images);
    }
  })(0, maxIterations, images, imageInfo, showImages);
}


function sendCustomMemeFromPopular(sender, result, topText, botText) {
  var images = [];
  var imageInfo = [];
  const maxIterations = result.length > MAX_CARDS_IN_HSCROLL
    ? MAX_CARDS_IN_HSCROLL
    : result.length;
  for (let i = 0; i < maxIterations; i++) {
    const generatorID = result[i].generatorID;
    let imageUrl = result[i].imageUrl.split('/');
    const imageUrlLength = imageUrl.length;
    const imageIDDeliminator = imageUrl[imageUrlLength - 1].indexOf('.');
    const imageID = imageUrl[imageUrlLength - 1].substring(0, imageIDDeliminator);
    imageInfo.push({
      "imageID": imageID,
      "generatorID": generatorID
    });
  }
  function showImages(images) {
    sendImagesAsMessage(sender, images);
  }
  (function getImages(i, iterations, images, imageInfo, callback) {
    if (i < iterations) {
      request(
        'http://version1.api.memegenerator.net/Instance_Create?'
          + 'username=' + process.env.USERNAME
          + '&password=' + process.env.PASSWORD
          + '&generatorID=' + imageInfo[i].generatorID
          + '&imageID=' + imageInfo[i].imageID
          + (topText !== null ? '&text0=' + topText : '')
          + (botText !== null ? '&text1=' + botText : ''),
        (function (error, response, body) {
          if (!error && response.statusCode == 200) {
            let memeResult = JSON.parse(body).result;
            const currElement = {
              "title": memeResult.displayName,
              "image_url": memeResult.instanceImageUrl,
              "buttons": [
                getPayloadButton("Get Image", "" + memeResult.instanceImageUrl),
              ],
            }
            images.push(currElement);
            getImages(i + 1, iterations, images, imageInfo, callback);
          }
        }
      )
    )} else {
      callback(images);
    }
  })(0, maxIterations, images, imageInfo, showImages);
}

function sendTrendingTemplates(sender) {
  request(
    'http://version1.api.memegenerator.net/Generators_Select_ByPopular?',
    + 'days=' + 30, // Keep it at 30 or all-time?
    (function (error, response, body) {
      let images = [];
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        const maxIterations = result.length > MAX_CARDS_IN_HSCROLL
          ? MAX_CARDS_IN_HSCROLL
          : result.length;
        for (let i = 0; i < maxIterations; i++) {
          const currElement = {
            "title": result[i].displayName,
            "image_url": result[i].imageUrl,
            "buttons": [
              getPayloadButton("Get Image", "" + result[i].imageUrl),
            ],
          }
          images.push(currElement);
        }
      }
      sendImagesAsMessage(sender, images);
    }
  ))
}

function sendImagesAsMessage(sender, images) {
  let messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": images,
      }
    }
  }
  request(getRequestParams(sender, messageData));
}

function sendImageAttachment(sender, url) {
  const messageData = {
    attachment: {
      type: "image",
      payload: {
        url: url,
      }
    }
  };
  request(getRequestParams(sender, messageData));
}

function sendTextMessage(sender, text) {
  let messageData = { text: text };
  request(getRequestParams(sender, messageData));
}

function sendPayloadMessage(sender, link) {
  const messageData1 = { text: PAYLOAD_MESSAGE };
  const messageData2 = { text: link };
  request(getRequestParams(sender, messageData1),
    function(error, response, body) {
      request(getRequestParams(sender, messageData2))
    }
  );
}

function sendHelpMessage(sender) {
  const messageData1 = { text: HELP_MESSAGE_1 };
  const messageData2 = { text: HELP_MESSAGE_2 };
  const messageData3 = { text: HELP_MESSAGE_3 };
  const messageData4 = { text: HELP_MESSAGE_4 };
  request(getRequestParams(sender, messageData1),
    function(error, response, body) {
      request(getRequestParams(sender, messageData2),
        function(error, response, body) {
          request(getRequestParams(sender, messageData3),
            function(error, response, body) {
              request(getRequestParams(sender, messageData4))
            }
          )
        }
      )
    }
  );
}

function sendAdvancedMessage(sender) {
  const messageData1 = { text: ADVANCED_MESSAGE_1 };
  const messageData2 = { text: ADVANCED_MESSAGE_2 };
  request(getRequestParams(sender, messageData1),
    function(error, response, body) {
      request(getRequestParams(sender, messageData2))
    }
  );
}

function getPayloadButton(title, payload) {
  return {
    "type":"postback",
    "title": title,
    "payload": payload,
  };
}

function getRequestParams(sender, messageData) {
  return {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token:process.env.TOKEN },
    method: 'POST',
    json: {
      recipient: { id: sender },
      message: messageData,
    }
  };
}
