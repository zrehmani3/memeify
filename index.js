'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const fs = require('fs');
const gm = require('gm');
const app = express()
const http = require('http');

const imgur = require('imgur');

const USERNAME = 'zmrehmani';
const PASSWORD = 'vba1000';

app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function (req, res) {
  res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
  if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
    res.send(req.query['hub.challenge'])
  }
  res.send('Error, wrong token');
})

// Spin up the server
app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})

app.post('/webhook/', function (req, res) {
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      let text = event.message.text;
      if (text.indexOf('#memeify_search') > -1) {
        if (text.indexOf('top_text') > -1 && text.indexOf('bot_text') > -1) {
          // Search for meme then apply custom text to it
          const inputQuery = text.split('\n');
          console.log(inputQuery);
          const typeTextDeliminator = inputQuery[1].indexOf(':');
          let typeText = inputQuery[1].substring(typeTextDeliminator + 1);
          const topTextDeliminator = inputQuery[2].indexOf(':');
          let topText = inputQuery[2].substring(topTextDeliminator + 1);
          topText = topText.split('_').join(' ');
          const botTextDeliminator = inputQuery[3].indexOf(':');
          let botText = inputQuery[3].substring(botTextDeliminator + 1);
          botText = botText.split('_').join(' ');
          getGeneratorIDFromQueryType(sender, typeText, topText, botText);
        } else if (text.indexOf('type') > -1) {
          // Search for memes related to the query
          const inputQuery = text.split('\n');
          console.log(inputQuery);
          const typeTextDeliminator = inputQuery[1].indexOf(':');
          let typeText = inputQuery[1].substring(typeTextDeliminator + 1);
          getGeneratorIDFromQueryType(sender, typeText, null, null);
        }
        // Use memegenerator search API
      } else if (text.indexOf('popular') > -1) {
        // Use memegenerator api to search for popular memes
        console.log('popular')
        request('http://version1.api.memegenerator.net/Generators_Select_ByPopular?pageSize=1&days=1',
          (function (error, response, body) {
            if (!error && response.statusCode == 200) {
              let result = JSON.parse(body).result;
              console.log(result);
              sendGenericImage(sender, result[0].imageUrl)
            }
          })
        )
      } else if (text.indexOf('#memeify_link') > -1) {
        const inputQuery = text.split('\n');
        console.log(inputQuery);
        const linkTextDeliminator = inputQuery[1].indexOf(':');
        let linkText = inputQuery[1].substring(linkTextDeliminator + 1);
        const topTextDeliminator = inputQuery[2].indexOf(':');
        let topText = inputQuery[2].substring(topTextDeliminator + 1);
        topText = topText.split('_').join(' ');
        const botTextDeliminator = inputQuery[3].indexOf(':');
        let botText = inputQuery[3].substring(botTextDeliminator + 1);
        botText = botText.split('_').join(' ');
        getCustomMemeFromLink(sender, topText, botText, linkText);
        // Memify using existing link
      } else if (text.indexOf('upload') > -1 && event.message.attachments) {
        console.log('#memeify_upload')
        const inputQuery = text.split('\n');
        console.log(inputQuery);
        const topTextDeliminator = inputQuery[1].indexOf(':');
        let topText = inputQuery[1].substring(topTextDeliminator + 1);
        topText = topText.split('_').join(' ');
        const botTextDeliminator = inputQuery[2].indexOf(':');
        let botText = inputQuery[2].substring(botTextDeliminator + 1);
        botText = botText.split('_').join(' ');
        if (event.message.attachments.length === 1) {
          const attachedURL = event.message.attachments[0].payload.url;
          imgur.uploadUrl(attachedURL)
            .then(function (json) {
              getCustomMemeFromLink(sender, topText, botText, json.data.link);
            }
          )
        } else {
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
              console.log('done');
            });
            download(uploadedImagesLink[1], '2.png', function() {
              console.log('done');
            });
            gm("1.png").append("2.jpg")
            imgur.uploadFile('1.png')
              .then(function (json) {
                  console.log(json.data.link);
              }
            )
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
        // Upload image and memeify
      } else if (text.indexOf('z') > -1) {
        sendPopularTemplate(sender)
        // Display popular memes
      } else {
        // Default error message
        sendGenericErrorMessage(sender);
      }
    }
  }
  res.sendStatus(200)
})

function getCustomMemeFromLink(sender, topText, botText, link) {
  const customLinkImgUrl =
    'https://memegen.link/custom/'
      + topText + '/'
      + botText + '/'
      + 'output.jpg?'
      + 'alt=' + link;
  sendGenericImage(sender, customLinkImgUrl)
}

function getGeneratorIDFromQueryType(sender, typeText, topText, botText) {
  request(
    'http://version1.api.memegenerator.net/Generators_Search?'
    + 'q=' + typeText,
    (function (error, response, body) {
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        if (topText !== null && botText !== null) {
          sendCustomMemeFromPopular(sender, result, topText, botText);
        } else {
          sendMemeFromPopularQuery(sender, result);
        }
      }
    })
  )
}

function sendGenericErrorMessage(sender) {
  const genericErrorMessageText = 'Sorry, we couldnt understand your request. ' +
    'Type help for more information.';
  let messageData = { text: genericErrorMessageText }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
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

function sendGenericImage(sender, imageURL) {
  console.log(imageURL);
  let messageData = {
      "attachment": {
          "type": "template",
          "payload": {
              "template_type": "generic",
              "elements": [{
                  "title": "Your customized meme",
                  "image_url": imageURL,
                  "buttons": [{
                      "type": "web_url",
                      "url": imageURL,
                      "title": "Get Dank Meme"
                  }],
              }]
          }
      }
  }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
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

  function sendPopularMessage(sender) {
    let result = JSON.parse(sender).result;
    console.log(result);
    let messageData = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
              "title": "First card",
              "subtitle": "Element #1 of an hscroll",
              "image_url":  result[0].imageUrl
          }]
        }
      }
    }
    request({
      url: 'http://version1.api.memegenerator.net/Generators_Select_ByPopular?pageSize=1&days=1',
      qs: {access_token:token},
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
    for (let i = 0; i < 10; i++) {
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
                "buttons": [{
                  "type": "web_url",
                  "url": memeResult.imageUrl,
                  "title": "Get Dank Meme"
                }],
              }
              images.push(currElement);
              getImages(i + 1, iterations, images, imageInfo, callback);
            }
          }
        )
      )} else {
        callback(images);
      }
    })(0, 10, images, imageInfo, showImages);
  }


function sendCustomMemeFromPopular(sender, result, topText, botText) {
  var images = [];
  var imageInfo = [];
  for (let i = 0; i < 10; i++) {
    let imageUrl = result[i].imageUrl.split('/');
    const imageUrlLength = imageUrl.length;
    const imageIDDeliminator = imageUrl[imageUrlLength - 1].indexOf('.');
    const generatorID = result[i].generatorID;
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
        + 'username=' + USERNAME
        + '&password=' + PASSWORD
        + '&generatorID=' + imageInfo[i].generatorID
        + '&imageID=' + imageInfo[i].imageID
        + '&text0=' + topText
        + '&text1=' + botText,
        (function (error, response, body) {
          if (!error && response.statusCode == 200) {
            let memeResult = JSON.parse(body).result;
            const currElement = {
              "title": memeResult.displayName,
              "image_url": memeResult.instanceImageUrl,
              "buttons": [{
                "type": "web_url",
                "url": memeResult.instanceImageUrl,
                "title": "Get Dank Meme"
              }],
            }
            images.push(currElement);
            getImages(i + 1, iterations, images, imageInfo, callback);
          }
        }
      )
    )} else {
      callback(images);
    }
  })(0, 10, images, imageInfo, showImages);
}

function sendPopularTemplate(sender)
{
  request(
    'http://version1.api.memegenerator.net/Generators_Select_ByPopular?',
    + 'days=' + 30,
    (function (error, response, body) {
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        console.log(result)
        var images = [];
        for (let i=0; i<10; i++) {
          const currElement = {
            "title": result[i].displayName,
            "image_url": result[i].imageUrl,
            "buttons": [{
              "type": "web_url",
              "url": result[i].imageUrl,
              "title": "Get Dank Meme"
            }, {
              "type":   "postback",
              "title":  "Postback",
              "payload":  result[i].imageUrl,
            }],
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
    qs: {access_token:token},
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
  let messageData = { text: text }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
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

const token = "EAAFIxfnYrI8BANKJq84CnknrANGuJMlygqrUOKReSYrHsM3yDQcbVGkOB0skPZCQQ9qtA0gNUTRTOdtYc4KyRN6Mt9Sj76fsXxfZC9qLBq8ZBfTJ2t6HQ9eTgylb4BNV5cQPa3MZCyBc7wq5nxpWVbLnzMdQLZAeR878cJu4TkgZDZD"
