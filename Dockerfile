FROM node:8

# Oracle environment variables
ENV ORACLE_HOME /opt/oracle/instantclient_12_2
ENV LD_LIBRARY_PATH=$ORACLE_HOME
ENV OCI_LIB_DIR=$ORACLE_HOME
ENV OCI_INC_DIR=$ORACLE_HOME/sdk/include

# Set working directory
WORKDIR /usr/src/app

# Copy Oracle InstantClient
COPY lib/instantclient/* /tmp/

# Update apt-get
# Running separately so that it can be cached
RUN apt-get -y update

# Install packages and setup Oracle
RUN \
	apt-get install -y unzip libaio1 && rm -rf /var/lib/apt/lists/* && \
	mkdir -p /opt/oracle && \
	unzip "/tmp/instantclient*.zip" -d /opt/oracle && \
	ln -s $ORACLE_HOME/libclntsh.so.12.1 $ORACLE_HOME/libclntsh.so

# Setup Node Modules for app
COPY ./package.json /usr/src/app/package.json
RUN npm install

# Setup PM2
RUN npm install pm2 -g

# Copy app
COPY ./routes /usr/src/app/routes
COPY ./other /usr/src/app/other
COPY ./plugins /usr/src/app/plugins
COPY ./server.js ./start.sh /usr/src/app/

# Start Node app
ENTRYPOINT ["/bin/bash", "./start.sh"]
