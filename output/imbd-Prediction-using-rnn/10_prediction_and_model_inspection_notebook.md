# Chapter 10: Prediction and Model Inspection Notebook

In [Chapter 9: Sentiment Analysis Streamlit Application](09_sentiment_analysis_streamlit_application.md), we built an amazing, user-friendly web application. We took our complex machine learning model and gave it a simple interface that anyone can use. Our project is officially a complete, end-to-end product!

But what about us, the developers? The Streamlit app is like a beautiful, finished car for a customer to drive. But sometimes, the mechanic needs to take the car into the workshop, pop the hood, check the engine, and run some diagnostics. The `prdictions.ipynb` notebook is our developer workshop. It's a place where we can directly "talk" to our model, inspect its parts, and test its performance on the fly.

### The Goal: A Playground for Our Model

Our goal is to have a simple, interactive space to play with our trained model. Imagine you want to quickly test a tricky review like, "This film wasn't terrible, but it wasn't great either." What would our model say? Instead of firing up the whole web app, we can just open our notebook, type the sentence, and get an instant answer.

This notebook is our tool for quick experiments, debugging, and demonstrating the model's core functionality without the extra layer of a user interface.

### Step 1: Setting Up the Workshop (Imports and Loading)

Just like any workshop, we first need to get our tools and the project we're working on. In our notebook, this means importing the necessary libraries and loading our "brain in a box"—the `simple_rnn_imdb.h5` model.

```python
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.datasets import imdb

# Load the pre-trained model
model = load_model('simple_rnn_imdb.h5')

# Load the word-to-number mapping
word_index = imdb.get_word_index()
```
This first block of code sets up our entire environment. It loads our fully trained [Trained Model Artifact](06_trained_model_artifact.md) and the `word_index` we need to translate English into the model's language of numbers, as we learned in [Chapter 7: preprocess_text](07_preprocess_text.md).

### Step 2: Popping the Hood (Model Inspection)

With our model loaded, we can immediately inspect it to make sure everything is correct. The `model.summary()` command gives us a blueprint of the model's architecture, just as we saw when we first built it.

```python
model.summary()
```
The output confirms that our loaded model has the right layers in the right order (`Embedding`, `SimpleRNN`, `Dense`). This is a great sanity check to confirm that we've loaded the correct file.
```
Model: "sequential"
_________________________________________________________________
 Layer (type)                Output Shape              Param #   
=================================================================
 embedding (Embedding)       (None, 500, 128)          1280000   
                                                                 
 simple_rnn (SimpleRNN)      (None, 128)               32896     
                                                                 
 dense (Dense)               (None, 1)                 129       
=================================================================
Total params: 1,313,025
...
```
We can even peek at the raw "memories" of the model—the millions of numbers it learned during training—by using `model.get_weights()`. This will print out giant lists of numbers, which are the very core of our model's knowledge!

### Step 3: Re-using Our Tools (Helper Functions)

To make predictions, we need our trusty helper functions. The `prdictions.ipynb` notebook includes the exact same `preprocess_text` and `predict_sentiment` functions we built in the previous chapters.

```python
# Function to preprocess user input
def preprocess_text(text):
    # ... code from Chapter 7 ...
    words = text.lower().split()
    encoded = [word_index.get(word, 2) + 3 for word in words]
    # ... padding code ...
    return padded_review

# Function to make a prediction
def predict_sentiment(review):
    # ... code from Chapter 8 ...
    preprocessed_input = preprocess_text(review)
    prediction = model.predict(preprocessed_input)
    # ... interpretation logic ...
    return sentiment, score
```
This is a great example of code reusability. We wrote these functions once for our application, and now we can use them again in our workshop notebook. We are simply calling the "manager" function we created in [Chapter 8: predict_sentiment](08_predict_sentiment.md).

### Step 4: Taking It for a Test Drive

Now for the fun part! The final cell in the notebook lets you define any movie review you can think of and immediately see the model's prediction.

Let's try that tricky review we thought of earlier.

```python
# Write any review you want to test!
example_review = "This film wasn't terrible, but it wasn't great either."

# Get the sentiment and score
sentiment, score = predict_sentiment(example_review)

# Print the results
print(f"Review: {example_review}")
print(f"Sentiment: {sentiment}")
print(f"Prediction Score: {score}")
```
**Example Output:**
```
Review: This film wasn't terrible, but it wasn't great either.
Sentiment: Negative
Prediction Score: 0.4512345
```
(Your score might be slightly different.)

The model predicted "Negative," with a score very close to the 0.5 middle ground. This makes sense! The review is neutral-to-negative, and the model's low confidence reflects that nuance. This kind of instant feedback is exactly why a developer's notebook is so useful. You can test edge cases and really get a "feel" for your model's personality.

### Conclusion of the Tutorial

And with that, you have completed your journey! The `prdictions.ipynb` notebook serves as the perfect final chapter, bringing together all the concepts we've learned into one simple, interactive script. It's your personal space to continue exploring the model you've built.

Let's take a moment to look back at everything you've accomplished:
1.  You loaded and prepared a real-world dataset of thousands of movie reviews.
2.  You explored the fundamental NLP concept of **Word Embeddings**.
3.  You designed and built a **Recurrent Neural Network (RNN)** from scratch.
4.  You created a robust **training pipeline** and trained your model.
5.  You learned how to save and load your model's intelligence using a **model artifact**.
6.  You wrote helper functions to process raw text and make predictions.
7.  And finally, you deployed your model in a beautiful, interactive **Streamlit web application** and created a notebook to inspect it.

You have successfully navigated the entire lifecycle of a machine learning project. You started with raw data and ended with a working product. The skills you've learned here are the foundation for tackling even bigger and more exciting challenges in the world of AI and Natural Language Processing.

Congratulations on your incredible work! Keep experimenting, keep learning, and happy coding.

---

Generated by [AI Codebase Knowledge Builder](https://github.com/The-Pocket/Tutorial-Codebase-Knowledge)