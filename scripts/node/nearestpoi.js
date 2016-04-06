var OSRM = require('osrm');

module.exports = function (villages,pois,options, done) {
    if (!options) throw 'options is mandatory';
    if (!options.network) throw 'network is mandatory in options';
        
    this.getList = function() {
        var osrm = options.network instanceof OSRM ? options.network : new OSRM(options.network);
        
        var results = [];
        
        var sources = villages.features.map(function(feat) {
            return [feat.geometry.coordinates[1], feat.geometry.coordinates[0]]
        });
        var destinations = pois.features.map(function(feat) {
            return [feat.geometry.coordinates[1], feat.geometry.coordinates[0]]
        });

        //There might be 0 destinations in the given area, osrm will trip over this, so we'll say it's infinity
        if(destinations.length == 0) {
            console.log('infinity');
            var empty = villages.features.map(function(f){return {eta:Infinity}});
            return done(null, empty);
        }
        else {
            osrm.table({
                    destinations: destinations,
                    sources: sources
                }, function(err, res) {
                    if (err) {
                        console.log(err);
                        return done(err);
                    }

                    if (res.distance_table &&
                        res.distance_table[0] && res.source_coordinates &&
                        res.distance_table[0].length == res.destination_coordinates.length) {
                        res.distance_table.forEach(function(time, idx) {
                            results.push({
                                eta: time.reduce(function(prev,cur){return Math.min(prev,cur)},Infinity) / 10 //the result is in tenth of a second                                    
                            });
                        });
                    }
                    return done(null, results);
                }
            );
        }
    };
    var self = this;
}