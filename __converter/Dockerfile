FROM rra-tools

COPY . /code

WORKDIR /code

RUN npm install

RUN mkdir /conversion && cd /conversion && echo "disk=/var/tmp/stxxl,2500,memory" > .stxxl && ln -s ../node_modules/osrm/profiles/lib/ .

CMD ["node", "index.js"]
