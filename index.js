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
const request = require('request')

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
//  initialOpening();
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      let text = event.message.text;
      if (text.indexOf('#memeify_search') > -1) {
        const inputQuery = text.split('\n');
        if (inputQuery.length === 4) {
          // Search for meme then apply custom text to it
          let typeText = extractInfoFromInputQuery(inputQuery, 1);
          let topText = extractInfoFromInputQuery(inputQuery, 2);
          let botText = extractInfoFromInputQuery(inputQuery, 3);
          getGeneratorIDFromQueryType(sender, typeText, topText, botText, false);
        } else if (inputQuery.length === 2) {
          // Search for memes templates related to the query
          let typeText = extractInfoFromInputQuery(inputQuery, 1);
          getGeneratorIDFromQueryType(sender, typeText, null, null, false);
        }
      } else if (text.indexOf('#memeify_popular') > -1) {
        const inputQuery = text.split('\n');
        if (inputQuery.length === 2) {
          // We have specified that we're looking for popular memes (instances)
          // pertaining to a specific type
          let typeText = extractInfoFromInputQuery(inputQuery, 1);
          getGeneratorIDFromQueryType(sender, typeText, null, null, true);
        } else {
          // We just want popular instances of memes, regardless of the type
          sendPopularMemesFromSpecificType(sender, null);
        }
      } else if (text.indexOf('#memeify_link') > -1) {
        // Memify using existing link
        const inputQuery = text.split('\n');
        let linkText = extractInfoFromInputQuery(inputQuery, 1);
        let topText = extractInfoFromInputQuery(inputQuery, 2);
        let botText = extractInfoFromInputQuery(inputQuery, 3);
        getCustomMemeFromLink(sender, topText, botText, linkText);
      } else if (text.indexOf('#memeify_upload') > -1 && event.message.attachments) {
        // Upload image and memeify. Users can add two images to stack them on
        // top of each other to memeify.
        const inputQuery = text.split('\n');
        let topText = extractInfoFromInputQuery(inputQuery, 1);
        let botText = extractInfoFromInputQuery(inputQuery, 2);
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
            var download = function(uri, filename, callback) {
              request.head(uri, function(err, res, body) {
                request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
              });
            };
            download(uploadedImagesLink[0], '1.png', function() {
              download(uploadedImagesLink[1], '2.png', function() {
                gm("1.png").append("2.png")
                  .write('3.png', function (err) {
                    if (!err) {
                      imgur.uploadFile('3.png')
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
      } else if (text.indexOf('#memeify_discover') > -1) {
        sendTrendingTemplates(sender)
        // Display popular memes
      } else if (text.indexOf('/help') > -1) {
        helpFunction(sender);
      } else {
        // Default error message
        sendGenericErrorMessage(sender);
      }
    }
  }
  res.sendStatus(200)
})

function extractInfoFromInputQuery(inputQuery, infoIndex) {
  let deliminator = inputQuery[infoIndex].indexOf(':');
  if (deliminator === -1) {
    deliminator = inputQuery[infoIndex].indexOf('=');
  }
  if (deliminator >= 0) {
    return inputQuery[infoIndex].substring(deliminator + 1).trim();
  } else {
    return inputQuery[infoIndex].trim();
  }
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
                "title": "Open Dank Meme"
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
      + topText + '/'
      + botText + '/'
      + 'output.jpg?'
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
        if (topText !== null && botText !== null) {
          sendCustomMemeFromPopular(sender, result, topText, botText);
        } else {
          if (showInstances) {
            sendPopularMemesFromSpecificType(sender, result);
          } else {
            sendMemeFromPopularQuery(sender, result);
          }
        }
      }
    })
  )
}

function sendGenericErrorMessage(sender) {
  const genericErrorMessageText = 'Sorry, we couldnt understand your request. ' +
    'Type help for more information.';
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
              "title": "Open Dank Meme"
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

function sendMemeFromPopularQuery(sender, result) {
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
            if (currElement) {
              const currElement = {
                "title": memeResult.displayName,
                "image_url": memeResult.imageUrl,
                "buttons": [
                  {
                    "type": "web_url",
                    "url": memeResult.imageUrl,
                    "title": "Open Dank Meme"
                  },
                  {
                    "type": "element_share",
                  },
                ],
              }
              images.push(currElement);
            }
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
          + '&text0=' + topText
          + '&text1=' + botText,
        (function (error, response, body) {
          if (!error && response.statusCode == 200) {
            let memeResult = JSON.parse(body).result;
            if (memeResult) {
              const currElement = {
                "title": memeResult.displayName,
                "image_url": memeResult.instanceImageUrl,
                "buttons": [
                  {
                    "type": "web_url",
                    "url": memeResult.instanceImageUrl,
                    "title": "Open Dank Meme"
                  },
                  {
                    "type": "element_share",
                  },
                ],
              }
              images.push(currElement);
            }
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
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        let images = [];
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
                "title": "Open Dank Meme"
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

function sendTextMessage(sender, text) {
  let messageData = { text: text };
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


function helpFunction(sender) {
  let text = "Welcome to the help menu!\nTo search for memes, type " +
  "'#memeify_search [meme name]'.\nFor popular memes, type '#memify_popular" +
  "[meme name]'.\nFor popular meme templates, type '#memeify_popular_template'." +
  "\nTo use your own text on an existing linked meme, type '#memeify_link'." +
  "\nTo upload your own image and add your own text, type '#memeify_upload' " +
  "(you can upload to stack them)."
  let messageData = { text: text };
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

/*function initialOpening()
{
  request({
    url: "https://graph.facebook.com/v2.6/me/thread_settings?access_token=PAGE_ACCESS_TOKEN"
    qs: {access_token:process.env.token},
    method: 'POST'
    json: {
      setting_type:'call_to_actions',
      thread_state:'new_thread',
      call_to_actions:[
      {
      payload: 'USER_DEFINED_PAYLOAD'
      }
    ]
    }
  })
}
*/
