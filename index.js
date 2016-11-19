'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()

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
        } else {
          // Search for memes related to the query
          console.log('search')
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
      } else if (text.indexOf('link') > -1) {
        console.log('link')
        // Memify using existing link
      } else if (text.indexOf('upload') > -1) {
        console.log('upload')
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

function getGeneratorIDFromQueryType(sender, typeText, topText, botText) {
  request(
    'http://version1.api.memegenerator.net/Generators_Search?'
    + 'q=' + typeText,
    (function (error, response, body) {
      if (!error && response.statusCode == 200) {
        let result = JSON.parse(body).result;
        sendCustomMemeFromPopular(sender, result, topText, botText);
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
                    "title": "First card",
                    "subtitle": "Element #1 of an hscroll",
                    "image_url": imageURL,
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.messenger.com",
                        "title": "web url"
                    }, {
                        "type": "postback",
                        "title": "Postback",
                        "payload": "Payload for first element in a generic bubble",
                    }]
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
              "image_url": memeResult.imageUrl,
              "buttons": [{
                "type": "web_url",
                "url": memeResult.imageUrl,
                "title": "Get Dank Meme"
              }],
            }
            console.log(memeResult);
            images.push(currElement);
            getImages(i + 1, iterations, images, imageInfo, callback);
          }
        }
      )
    )} {
      callback(images);
    }
  })(0, 2, images, imageInfo, showImages);
  // getImages(0, 2, images);
  // console.log(images);
  // sendImagesAsMessage(sender, images);
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
