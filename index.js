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
  console.log('running on port', expressApp.get('port'));
})

expressApp.post('/webhook/', function (req, res) {
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      let text = event.message.text.trim();
      if (text.indexOf('-Memeify') === -1) {
        if (text.toLowerCase().indexOf('#search') > -1) {
          const inputQuery = text.split('#');
          inputQuery.shift();
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
          const inputQuery = text.split('#');
          inputQuery.shift();
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
          // Memify using existing link
          const inputQuery = text.split('#');
          inputQuery.shift();
          let linkText = extractInfoFromInputQuery(inputQuery, 1);
          let topText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 2));
          let botText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 3));
          getCustomMemeFromLink(sender, topText, botText, linkText);
        } else if (text.toLowerCase().indexOf('#upload') > -1 && event.message.attachments) {
          // Upload image and memeify. Users can add two images to stack them on
          // top of each other to memeify.
          const inputQuery = text.split('#');
          inputQuery.shift();
          let topText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 1));
          let botText = sanitizeMemeText(extractInfoFromInputQuery(inputQuery, 2));
          if (event.message.attachments.length === 1) {
            const attachedURL = event.message.attachments[0].payload.url;
            imgur.uploadUrl(attachedURL)
              .then(function (json) {
                getCustomMemeFromLink(sender, topText, botText, json.data.link);
              }
            )
          } else if (event.message.attachments.length === 2) {
            let imageInputLen = 2;
            const attachedURL1 = event.message.attachments[0].payload.url;
            const attachedURL2 = event.message.attachments[1].payload.url;
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
        } else if (text.toLowerCase().indexOf('#discover') > -1) {
          sendTrendingTemplates(sender)
          // Display popular memes
        } else if (text.toLowerCase().indexOf('#help') > -1) {
          sendHelpMessage(sender);
        } else {
          // Default error message
          sendGenericErrorMessage(sender);
        }
      }
    } else if (event.message && event.message.attachments
      && event.message.attachments.length > 0
      && event.message.attachments[0].payload !== null
      && event.message.attachments[0].payload.url !== undefined
      && event.message.attachments[0].payload.url !== null
    ) {
      // We are uploading an image only
      const uploadedImageName = '' + sender + '.png';
      let download = function(uri, filename, callback) {
        request.head(uri, function(err, res, body) {
          request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
        });
      };
      download(event.message.attachments[0].payload.url, uploadedImageName, function() {
        imgur.uploadFile(uploadedImageName)
          .then(function (json) {
            const link = json.data.link;
            const element = [{
              "title": "Your Image",
              "image_url": link,
              "buttons": [
                {
                  "type": "web_url",
                  "url": link,
                  "title": "Open Image"
                },
                {
                  "type": "element_share",
                },
                {
                  "type":"postback",
                  "title":"Memeify",
                  "payload":"#link #" + link + " #<top_text> #<bot_text>-Memeify",
                },
              ],
            }];
            sendImagesAsMessage(sender, element);
          }
        );
      });
    } else if (event.postback) {
      let payloadLink = event.postback.payload.replace('-Memeify', '');
      sendPayloadMessage(sender, payloadLink);
    }
  }
  res.sendStatus(200)
})

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
              {
                "type": "web_url",
                "url": result[i].instanceImageUrl,
                "title": "Open Meme"
              },
              {
                "type": "element_share",
              },
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
      + 'alt=' + link;
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

function sendGenericErrorMessage(sender) {
  const genericErrorMessageText = 'Sorry, I couldnt understand your request. ' +
    'Type #help for information on how to use the bot.';
  let messageData = { text: genericErrorMessageText };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:process.env.TOKEN},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
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
            {
              "type": "web_url",
              "url": imageURL,
              "title": "Open Meme"
            },
            {
              "type": "element_share",
            },
          ],
        }]
      }
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:process.env.TOKEN},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
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
                {
                  "type": "web_url",
                  "url": memeResult.imageUrl,
                  "title": "Open Meme"
                },
                {
                  "type": "element_share",
                },
                {
                  "type":"postback",
                  "title":"Memeify",
                  "payload":"#search #" + typeText + " #<top_text> #<bot_text>-Memeify",
                },
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
                {
                  "type": "web_url",
                  "url": memeResult.instanceImageUrl,
                  "title": "Open Meme"
                },
                {
                  "type": "element_share",
                },
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
    + 'days=' + 30, // Keep it at 30 or all-time? Or let the user decide?
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
              {
                "type": "web_url",
                "url": result[i].imageUrl,
                "title": "Open Meme"
              },
              {
                "type": "element_share",
              },
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
        "elements": images
      }
    }
  }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:process.env.TOKEN},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
}

function sendPayloadMessage(sender, link) {
  let helperText = 'Type the following to memeify the image! Type #help for a specific example\n\n';
  let messageData1 = { text: helperText };
  let messageData2 = { text: link };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:process.env.TOKEN},
    method: 'POST',
    json: {
        recipient: {id:sender},
        message: messageData1,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    } else {
      request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:process.env.TOKEN},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData2,
        }
      }, function(error, response, body) {
        if (error) {
          console.log('Error sending messages: ', error)
        } else if (response.body.error) {
          console.log('Error: ', response.body.error)
        }
      })
    }
  })
}

function sendHelpMessage(sender) {
  let text1 =
    "Welcome to the help menu!\n\n" +
    "To search for memes, type '#search #<meme_name>' (without quotes around the command AND without the '<' and '>')\n\n" +
    "You can apply custom text to the memes you search for." +
    "For example, you can try '#search #<meme_name> #<top_text> #<bot_text>' (put NONE as <top_text> or <bot_text> to ignore).\n\n" +
    "You can type '#popular' to see what are the current trending memes" +
    "(that include text) that are circulating around the internet, and if you just want" +
    "the popular memes that include text for a specific type, simply try '#popular #<meme_type>'.\n\n" +
    "To discover current trending templates (without text), simply try '#discover'. -Memeify";
  let text2 =
    "You can even use your own pics and memeify those! You can provide a link through" +
    "'#link #<url> #<top_text> #<bot_text>' and we'll take care of mememifying it for you.\n\n" +
    "You can also upload your own image through messenger and type '#upload #<top_text> #<bot_text>'" +
    "(as in attach the image + type the command) and we'll also memeify it for you. If on mobile just upload the image, and we'll explain where to go from there\n\n" +
    "Lastly, you can upload up to two images (on web only as of now), and we'll stack" +
    "them on top of each other and apply the text to the resulting, stacked image. -Memeify";
  let text3 = "Here's an example! (NOTE there are no quotes or <>):\n\n-Memeify";
  let text4 = "#search #lebron james #i am #the goat";
  let messageData1 = { text: text1 };
  let messageData2 = { text: text2 };
  let messageData3 = { text: text3 };
  let messageData4 = { text: text4 };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:process.env.TOKEN},
    method: 'POST',
    json: {
        recipient: {id:sender},
        message: messageData1,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    } else {
      request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:process.env.TOKEN},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData2,
        }
      }, function(error, response, body) {
        if (error) {
          console.log('Error sending messages: ', error)
        } else if (response.body.error) {
          console.log('Error: ', response.body.error)
        } else {
          request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {access_token:process.env.TOKEN},
            method: 'POST',
            json: {
                recipient: {id:sender},
                message: messageData3,
            }
          }, function(error, response, body) {
            if (error) {
              console.log('Error sending messages: ', error)
            } else if (response.body.error) {
              console.log('Error: ', response.body.error)
            } else {
              request({
                url: 'https://graph.facebook.com/v2.6/me/messages',
                qs: {access_token:process.env.TOKEN},
                method: 'POST',
                json: {
                    recipient: {id:sender},
                    message: messageData4,
                }
              }, function(error, response, body) {
                if (error) {
                  console.log('Error sending messages: ', error)
                } else if (response.body.error) {
                  console.log('Error: ', response.body.error)
                }
              })
            }
          })
        }
      })
    }
  })
}
