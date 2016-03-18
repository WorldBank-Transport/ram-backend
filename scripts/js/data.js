d3.json('data/ReadytoUse/Guizhou_county.min.geojson',function (d) {
	countylist = d.features;
	var list = d3.select('#countyList')
		.selectAll('p')
		.data(d.features.sort(function(a,b){
			return d3.ascending(a.properties.NAME_3,b.properties.NAME_3)
		}))
		.enter()
		.append('p')
		.attr('id',function(f){return 'c-'+ f.properties.OBJECTID})
		.html(function(f){return f.properties.NAME_3})
		.on('click',function(e){
			socket.emit('getMatrixForRegion',{feature:e,id:new Date().getTime(),maxTime:3600,maxSpeed:120,geometryId:e.properties.OBJECTID})
		})
	})