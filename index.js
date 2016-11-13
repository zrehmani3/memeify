'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()

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
  res.send('Error, wrong token')
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
      let text = event.message.text
      if (text.indexOf('#memify_search') > 0) {
        if (text.indexOf('top_text') > 0 || text.indexOf('bot_text') > 0) {
          // Search for meme then apply custom text to it
          console.log('#memify_search_custom')
        } else {
          // Search for memes related to the query
          console.log('#memify_search')
        }
        // Use memegenerator search API
      } else if (text.indexOf('#memify_popular') > 0) {
        console.log('#memify_popular')
        // Use memegenerator popular API
      } else if (text.indexOf('#memify_link')) {
        console.log('#memify_link')
        // Memify using existing link
      } else if (text.indexOf('#memify_upload')) {
        console.log('#memify_upload')
        // Upload image and memify
      } else {
        // Default error message
        sendGenericErrorMessage(sender);
      }
    }
  }
  res.sendStatus(200)
})

function sendGenericErrorMessage(sender) {
  const genericErrorMessageText = 'Sorry, we couldn\'t understand your request.
    Type \'help\' for more information.';
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

function sendPopular(sender) {
  request('http://version1.api.memegenerator.net/Generators_Select_ByPopular?pageSize=3',
    (function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var x = JSON.parse(body);
        console.log(x)
        sendGenericMessage(sender, "high")
      }
    })
  )
}
//
// function sendGenericMessage(sender, imageUrl) {
//   console.log(imageUrl);
//   let messageData = {
//     "attachment": {
//       "type": "template",
//       "payload": {
//         "template_type": "generic",
//         "elements": [{
//           "title": "First card",
//           "subtitle": "Element #1 of an hscroll",
//           "image_url": imageUrl,
//         }]
//       }
//     }
//   }
//   request({
//     url: 'https://graph.facebook.com/v2.6/me/messages',
//     qs: {access_token:token},
//     method: 'POST',
//     json: {
//       recipient: {id:sender},
//       message: messageData,
//     }
//   }, function(error, response, body) {
//     if (error) {
//       console.log('Error sending messages: ', error)
//     } else if (response.body.error) {
//       console.log('Error: ', response.body.error)
//     }
//   })
// }

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
