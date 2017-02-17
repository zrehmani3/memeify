<h1>Memeify</h1>

<h3>Privacy</h3>
We can see what you post, and since images you upload may go through a public API, they may be uploaded as publically viewable content. Keep that in mind.

<h3>Terms of Service</h3>
We can change the bot when we want to fit whatever needs.

Persistent menu CTA Script:
curl -X POST -H "Content-Type: application/json" -d '{
  "setting_type" : "call_to_actions",
  "thread_state" : "existing_thread",
  "call_to_actions":[
    {
      "type":"postback",
      "title":"#help",
      "payload":"HELP"
    },
    {
      "type":"postback",
      "title":"#advanced",
      "payload":"ADVANCED"
    },
    {
      "type":"postback",
      "title":"#search for memes",
      "payload":"SEARCH"
    },
    {
      "type":"postback",
      "title":"#upload your own image",
      "payload":"UPLOAD"
    },
  ]
}' "https://graph.facebook.com/v2.6/me/thread_settings?access_token=process.env.TOKEN"

Get started CTA Script:
curl -X POST -H "Content-Type: application/json" -d '{
  "setting_type":"call_to_actions",
  "thread_state":"new_thread",
  "call_to_actions":[
    {
      "payload":"GET_STARTED"
    }
  ]
}' "https://graph.facebook.com/v2.6/me/thread_settings?access_token=process.env.TOKEN"
