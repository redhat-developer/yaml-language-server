node('rhel7'){
    stage ('Checkout yaml server code'){
        deleteDir()
        git url: 'https://github.com/redhat-developer/yaml-language-server.git'
    }
    stage ('install build requirements'){
        def nodeHome = tool 'nodejs-7.7.4'
        env.PATH="${env.PATH}:${nodeHome}/bin"
        sh "npm install -g typescript"
    }

    stage ('build & test server'){
        def archive = "yaml-language-server-${env.BUILD_NUMBER}.tar.gz"
        sh "npm install"
        sh "npm run compile"
        sh "npm test"
        sh "tar -zcvf ${archive} ./out"
        sh "rsync -Pzrlt --rsh=ssh --protocol=28 ${archive}  ${UPLOAD_LOCATION}"
        sh "mkdir -p tmp"
        dir("tmp"){
            sh "mkdir -p static/oxygen/stable/builds/yaml-language-server/ oxygen/stable/builds/yaml-language-server/"
        }
        dir("tmp/oxygen/stable/builds/yaml-language-server/"){
            sh "ln -s ../../../../static/oxygen/stable/builds/yaml-language-server/${archive} yaml-language-server-latest.tar.gz"
            sh "rsync -Pzrlt --rsh=ssh --protocol=28 yaml-language-server-latest.tar.gz ${LATEST_LOCATION}"
        }
        sh "rm -f ${archive} yaml-language-server-latest.tar.gz"
    }
}
