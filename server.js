var express = require('express');
var mongodb = require('mongodb');

run = function(client) {
  var app = express.createServer();
  
  app.register( '.ejs', require('ejs') );
  app.use( express.static(__dirname + '/public') );
  app.use( express.bodyParser() );
  app.use( express.cookieParser() );
  app.use( app.router );
  
  app.get('/',function(req,res){
    var surveys = new mongodb.Collection(client, 'surveys');
    surveys.find( {}, {} ).sort({id:-1}).limit(20).toArray( function(err,docs) {
      /* FIXME handle error */
      if ( err ) { console.log("surveys.find() error:" + err); }
      res.render( 'index.ejs', { surveys: docs } );
    });
  });
  app.post('/survey',function(req,res){
    /* strip leading and trailing spaces, and collapse multiple spaces
       and then break into an array */
    choices = req.body.choices.replace(/(^\s*)|(\s*$)/g,'').replace(/\s{2,}/g,' ').split(' ');
    var surveys = new mongodb.Collection(client,'surveys');
    var survey = { name: req.body.name, choices: choices };
    surveys.insert( survey, function(err,objects) {
      /* FIXME handle error */
      if ( err ) { console.log("suveys.insert() error:" + err); }
      res.redirect("/");
    });
  });
  app.get('/respond/:id',function(req,res){
    var surveys = new mongodb.Collection(client,'surveys');
    var id = new client.bson_serializer.ObjectID(req.params.id);
    surveys.findOne( { _id: id }, function(err,doc) {
      /* FIXME handle error */
      if ( err ) { console.log(err); }
      res.render('respond.ejs', { survey: doc } );
    });
  });
  app.post('/respond/:id',function(req,res){
    var survey_id = new client.bson_serializer.ObjectID(req.params.id);
    var responses = new mongodb.Collection(client,'responses');
    var response = { survey_id: survey_id, choices: req.body.choices }
    var summaries = new mongodb.Collection(client,'summaries');
    responses.insert( response, function(err,objects) {
      /* FIXME handle error */
      if ( err ) { console.log(err); }
      var count = req.body.choices.length;
      req.body.choices.forEach( function(choice) {
        summaries.update( { survey_id: survey_id, choice: choice }, {$inc: { 'responses' : 1 }}, { upsert: true }, function() {
          if ( --count == 0 ) {
            res.redirect("/results/" + req.params.id );  
          }
        });
      });
    });
  });
  app.get('/results/:id',function(req,res){
    var surveys = new mongodb.Collection(client,'surveys');
    var summaries = new mongodb.Collection(client,'summaries');
    var id = new client.bson_serializer.ObjectID(req.params.id);
    surveys.findOne( { _id: id }, function(err,survey) {
      summaries.find( { survey_id: id }).toArray(function(err,docs) {
        /* FIXME handle error */
        if ( err ) { console.log(err); }
        var total_responses = 0;
        docs.forEach( function(e) { 
          total_responses += e.responses; 
        });
        var percentages = {};
        docs.forEach( function(e) {
           var n = Math.round( 100.0 * e.responses / total_responses );
           percentages[e.choice] = n;
        });
        res.render('results.ejs', { id: req.params.id, survey: survey, results: docs, percentages: percentages } );
      });
    });
  });
  var port = process.env.VCAP_APP_PORT || process.env.PORT || 8001;
  app.listen(port);
  console.log('Server listing on port '+ port);

};

if ( process.env.VCAP_SERVICES ) {
  var service_type = "mongodb-1.8";
  var json = JSON.parse(process.env.VCAP_SERVICES);
  var credentials = json[service_type][0]["credentials"];
  console.log("Credentials:");
  console.log(credentials);
  var server = new mongodb.Server( credentials["host"], credentials["port"]);
  new mongodb.Db( credentials["db"], server, {} ).open( function(err,client) {
    client.authenticate( credentials["username"], credentials["password"], function(err,replies) { 
      console.log("mongodb authenticated");
      run(client);
    });
  });
} else {
  console.log("Connecting to mongodb on localhost");
  var server = new mongodb.Server("127.0.0.1",27017,{});
  new mongodb.Db( "mongo_survey", server, {} ).open( function(err,client) {
    if ( err ) { throw err; }
    console.log("mongodb opened");
    run(client);
  });
}



