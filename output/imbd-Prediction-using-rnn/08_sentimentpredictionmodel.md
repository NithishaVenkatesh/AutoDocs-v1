# Chapter 8: The Sentiment Prediction Model

In the [previous chapter on `decode_review`](07_decode_review.md), we learned how to build a "decoder ring" to translate our model's numerical language back into human-readable text. We now have a complete toolkit for preparing and inspecting our data.

It's finally time to introduce the star of the show: the model itself. This is the "brain" of our application, the part that actually learns from data and makes predictions. In our project, this is our `SentimentPredictionModel`.

### The Problem: How to Make a Prediction?

We've done all this work to turn a user's review, like `"This movie was absolutely brilliant!"`, into a perfectly formatted list of 500 numbers. Now what?

We need a component that can take this list of numbers and, based on patterns it has learned from thousands of other movie reviews, output a single score that tells us the sentiment. A high score should mean "positive," and a low score should mean "negative."

This is the job of our pre-trained Keras model.

**Analogy:** Imagine a movie critic who has watched and reviewed ten thousand movies. Over time, they develop an intuition. They can read a new review and, based on the choice of words and phrases, instantly guess whether the original writer liked the movie or not. Our model is that experienced critic, but its experience comes from data, not from watching movies.

### The Code in Action: Loading the Model

In this project, we aren't training a new model from scratch. That process can take a lot of time and computing power. Instead, we're using a model that has already been trained on the IMDB dataset. All its "knowledge" is saved in a single file: `simple_rnn_imdb.h5`.

Our first step is to load this file into our application.

```python
from tensorflow.keras.models import load_model

# Load our pre-trained model from the file
model = load_model('simple_rnn_imdb.h5')
```
This simple command does something incredible. It reads the `simple_rnn_imdb.h5` file and perfectly reconstructs the entire neural network, including:
*   Its architecture (all the layers in the correct order).
*   Its learned knowledge (all the "weights" and connections that were fine-tuned during training).

The `model` variable now holds our ready-to-use prediction engine.

### Using the Model to Predict Sentiment

Once the model is loaded, using it is incredibly straightforward. We just need to call its `predict()` method and give it our preprocessed text.

Let's see the full workflow:

1.  Take a user's review.
2.  Use our [preprocess_text](06_preprocess_text.md) function to convert it into a padded list of 500 numbers.
3.  Feed this list to `model.predict()`.

```python
# Assume we have our preprocess_text function from Chapter 6
user_review = "this movie was a complete masterpiece"
preprocessed_input = preprocess_text(user_review)

# Get the prediction from the model
prediction_score = model.predict(preprocessed_input)

print(prediction_score)
```
**Output:**
```
[[0.9987123]]
```
The model outputs a single number inside a nested list. This number is the sentiment score, and it will always be between 0 and 1.

*   A score **close to 1** indicates a **Positive** sentiment.
*   A score **close to 0** indicates a **Negative** sentiment.
*   A score around **0.5** is neutral or uncertain.

In our app, we use a simple `if` statement to turn this score into a human-readable label:
```python
score = prediction_score[0][0] # Extract the number
sentiment = 'Positive' if score > 0.5 else 'Negative'

print(sentiment) # Output: Positive
```

### Under the Hood: The Model's Architecture

You might be wondering what's inside this `model` object. It's a type of neural network called a **Recurrent Neural Network (RNN)**.

An RNN is specially designed for sequential data, like text. Unlike other models that look at all the data at once, an RNN reads a sentence one word at a time, from left to right, just like a human. It has a form of "memory" that lets it remember the context of the words it has already seen. This is crucial for understanding language, as the meaning of a sentence often depends on the order of the words (e.g., "not good" vs. "good not").

Our model has three main layers stacked on top of each other:

```mermaid
graph TD
    A[Input: Padded Review <br> (500 numbers)] --> B(Embedding Layer)
    B -- "A sequence of 500 word vectors" --> C(SimpleRNN Layer <br> 'The Brain with Memory')
    C -- "A final 'thought' vector summarizing the review" --> D(Dense Layer <br> 'The Final Decision Maker')
    D -- "Prediction Score (0.0 to 1.0)" --> E[Output]

    subgraph "Our Model: simple_rnn_imdb.h5"
        B
        C
        D
    end
```

1.  **Embedding Layer**: This is the exact same type of layer we explored in the [EmbeddingLayerModel](04_embeddinglayermodel.md) chapter. It takes the 500 integer IDs and converts them into 500 meaningful vectors.
2.  **SimpleRNN Layer**: This is the heart of the model. It processes the sequence of word vectors one by one, updating its internal memory at each step to keep track of the overall context and sentiment.
3.  **Dense Layer**: After the RNN has processed the entire review, this final layer takes the RNN's summary and makes a final decision, squashing the result into a single probability score between 0 and 1.

The file `simple_rnn_imdb.h5` is a snapshot of this entire structure, with all the connections perfectly tuned from its training.

### Conclusion

Congratulations! You've just met the core component of our project: the pre-trained `SentimentPredictionModel`.

You've learned:
*   **What** the model does: It takes preprocessed text and outputs a sentiment score.
*   **How** to load it from a file using `load_model`.
*   **How** to use it to make predictions with `model.predict()`.
*   A high-level overview of its internal structure as a **Recurrent Neural Network (RNN)**.

We now have all the individual pieces of our project:
1.  A function to preprocess user input (`preprocess_text`).
2.  A trained model to make predictions (`model`).
3.  (And a helper function to decode for debugging, `decode_review`).

All that's left is to put these pieces together into a simple, interactive web application that a user can actually interact with.

Let's build the final app in our last chapter: [SentimentAnalysisApp](09_sentimentanalysisapp.md).

---

Generated by [AI Codebase Knowledge Builder](https://github.com/The-Pocket/Tutorial-Codebase-Knowledge)