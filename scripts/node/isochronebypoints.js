var point = require('turf-point'),
    isolines = require('turf-isolines'),
    featureCollection = require('turf-featurecollection'),
    OSRM = require('osrm');
var concaveman = require('concaveman');
var polygon = require('turf-polygon');

module.exports = function (center, time, options, done) {
    if (!options) throw 'options is mandatory';
    if (!options.network) throw 'network is mandatory in options';
    if (!options.maxspeed) throw 'maxspeed is mandatory in options';
    if (!options.destinations) throw 'destinations is mandatory in options';
    var unit = options.unit || 'kilometers';
    var socket = options.socket;
    if (options && options.draw) {
        this.draw = options.draw;
    } else {
        this.draw = function(destinations) {
  /*          var results = [];
            var filterpoint = time;
            destinations.features.forEach(function(timePoint,idx){
                if(timePoint.properties.eta <= filterpoint) {
                    results.push([timePoint.geometry.coordinates[0],timePoint.geometry.coordinates[1]]);
                }
            })
*/
 //           return featureCollection([polygon([concaveman(results,2)],{eta:time})]);
                socket.emit('status', {data:destinations})
              return isolines(destinations, 'eta', options.resolution, [time]);
        };
    }
    this.getIsochrone = function() {
        var osrm = options.network instanceof OSRM ? options.network : new OSRM(options.network);
        // compute bbox
        // bbox should go out 1.4 miles in each direction for each minute
        // this will account for a driver going a bit above the max safe speed
        var centerPt = point([center[0], center[1]]);

        //compute destination grid
        var targets = options.destinations;
        var destinations = featureCollection([]);
        var coord = targets.features.map(function(feat) {
            return [feat.geometry.coordinates[1], feat.geometry.coordinates[0]]
        });
        console.log('start osrm')
        socket.emit('status',{id:options.id,msg:'osrm started'})
        
        osrm.table({
                destinations: coord,
                sources: [[center[1], center[0]]]
            }, function(err, res) {
                if (err) {
                    console.log(err);
                    return done(err);
                }
                if (res.distance_table &&
                    res.distance_table[0] && res.destination_coordinates &&
                    res.distance_table[0].length == res.destination_coordinates.length) {

                    res.distance_table[0].forEach(function(time, idx) {
                         destinations.features.push({
                                type: 'Feature',
                                properties: {
                                    eta: time / 10
                                },
                                geometry: {
                                    type: 'Point',
                                    coordinates: [res.destination_coordinates[idx][1], res.destination_coordinates[idx][0]]
                                }
                            });
                        
                    });
                }
                console.log('done with orsm');
                socket.emit('status',{id:options.id,msg:'osrm done'})
                var result = self.draw(destinations);
                return done(null, result);
            }
        );
    };
    var self = this;

  
}