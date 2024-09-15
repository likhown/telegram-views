import time
import requests

# Configuration
BOT_TOKEN = '7333437316:AAFnRKM47c_mH8oixK-iItN8gAMmpNC0khU'
CHANNEL_ID = '@likhondotxyz'  # Replace with your actual channel username or ID
VIEW_THRESHOLD = 500000  # View count threshold
WAIT_TIME = 1800  # 30 minutes in seconds
API_URL = 'https://api.telegram.org'

def get_posts():
    """Fetch the latest posts from the channel."""
    url = f"{API_URL}/bot{BOT_TOKEN}/getUpdates"
    response = requests.get(url).json()
    posts = [update['message'] for update in response['result'] if 'message' in update and 'text' in update['message']]
    return posts

def get_post_views(post_id):
    """Get the number of views for a post. This example assumes you can directly get views via message details."""
    url = f"{API_URL}/bot{BOT_TOKEN}/getMessage?chat_id={CHANNEL_ID}&message_id={post_id}"
    response = requests.get(url).json()
    return response['result'].get('views', 0)

def process_posts():
    posts = get_posts()
    for post in posts:
        post_id = post['message_id']
        while True:
            views = get_post_views(post_id)
            if views >= VIEW_THRESHOLD:
                print(f"Post {post_id} has reached {VIEW_THRESHOLD} views.")
                break
            print(f"Waiting for post {post_id} to reach {VIEW_THRESHOLD} views. Current views: {views}")
            time.sleep(WAIT_TIME)  # Wait for 30 minutes before checking again

        # Move to the next post after 30 minutes
        time.sleep(WAIT_TIME)  # Wait for 30 minutes before processing the next post

def handler(request):
    process_posts()
    return {
        "statusCode": 200,
        "body": "Posts processed successfully."
    }
