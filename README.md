# Rural-Road-Accessibility

create a data directory in the root and copy the following files from the Box:

the entire POIs directory to data/POIs

the files 'Village_pop.geojson' from the Ready to Use directory to data/ReadytoUse (no spaces)

The entire OSRM-ready directory to your choosing, update the network variable in scripts/node/timematrix.js


To run the service and get results (in csv form):
```
npm install
cd scripts/node
node timematrix.js
cd ../..
node index.js
```

and open your browser at localhost:8080

Then click on a region and the csv should come out (with messages on the terminal and the web console).
