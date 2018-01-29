# CIRCLE_BRANCH='docker'
# AWS_REGION='us-east-1'

# ENVIRONMENT VARIABLES MUST BE SET
# USERNAME_DEV=
# PASSWORD_DEV=
# CONNECT_STRING_DEV=
# S3_ACCESS_KEY_ID_DEV=
# S3_SECRET_ACCESS_KEY_DEV=
# S3_BUCKET_DEV=
# REDIS_HOST_DEV=
# USERNAME_PRO=
# PASSWORD_PRO=
# CONNECT_STRING_PRO=
# S3_ACCESS_KEY_ID_PRO=
# S3_SECRET_ACCESS_KEY_PRO=
# S3_BUCKET_PRO=
# REDIS_HOST_PRO=

if [ "${CIRCLE_BRANCH}" == "master" ]; then
  DOCKER_IMAGE='968852064305.dkr.ecr.us-east-1.amazonaws.com/pilot-api2:latest'
  CLUSTER='pilot'
  DEV_CONTAINER='pilot-api2-dev'
  PRO_CONTAINER='pilot-api2-pro'

  # Login to AWS
  aws configure set region $AWS_REGION
  $(aws ecr get-login)
  # Tag and push docker image
  docker tag pilot-api2 $DOCKER_IMAGE
  docker push $DOCKER_IMAGE
  
  # Setup container template
  container_template='[
    {
      "image": "%s",
      "name": "%s",
      "essential": true,
      "memoryReservation": 2560,
      "portMappings": [
        {
          "containerPort": 3001,
          "hostPort": 3001
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "%s" },
        { "name": "USERNAME", "value": "%s" },
        { "name": "PASSWORD", "value": "%s" },
        { "name": "CONNECT_STRING", "value": "%s" },
        { "name": "S3_ACCESS_KEY_ID", "value": "%s" },
        { "name": "S3_SECRET_ACCESS_KEY", "value": "%s" },
        { "name": "S3_BUCKET", "value": "%s" },
        { "name": "REDIS_HOST", "value": "%s" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "pilot-api2",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "pilot-api2"
        }
      }
    }
  ]'

  # Deploy to ECS
  # We need to create a new task definition and update
  # the service with the new definition to trigger deployment
  # from our docker image. In the future this may not be necessary
  function deploy_ecs {
      # Replace variables in container_template
      container_def=$(printf "$container_template" $DOCKER_IMAGE $2 $1 $3 $4 $5 $6 $7 $8 $9)

      # Register task definition
      json=$(aws ecs register-task-definition --container-definitions "$container_def" --family "pilot-api2-$1" --network-mode "host")

      # Grab revision # using regular bash and grep
      revision=$(echo "$json" | grep -o '"revision": [0-9]*' | grep -Eo '[0-9]+')

      # Deploy revision
      aws ecs update-service --cluster "$CLUSTER" --service "pilot-api2-$1" --task-definition "pilot-api2-$1":"$revision"
  }

  # Deploy Staging
  deploy_ecs staging $DEV_CONTAINER $USERNAME_DEV $PASSWORD_DEV $CONNECT_STRING_DEV $S3_ACCESS_KEY_ID_DEV $S3_SECRET_ACCESS_KEY_DEV $S3_BUCKET_DEV $REDIS_HOST_DEV

  # Deploy Production
  deploy_ecs production $PRO_CONTAINER $USERNAME_PRO $PASSWORD_PRO $CONNECT_STRING_PRO $S3_ACCESS_KEY_ID_PRO $S3_SECRET_ACCESS_KEY_PRO $S3_BUCKET_PRO $REDIS_HOST_PRO

fi