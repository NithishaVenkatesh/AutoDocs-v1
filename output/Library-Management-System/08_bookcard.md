# Section 8: BookCard

## Overview

The `BookCard` is a reusable, presentational React component responsible for displaying a single book's details in a consistent card format. It encapsulates the layout for the book's cover image, title, author, rating, price, and genre, along with interactive controls.

Use this component in any view that renders a list or grid of books, such as the main [Books](05_books.md) page or within [Search](06_search.md) results, to maintain a uniform appearance across the application.

## Public API

The component's API is defined by its props.

### Props

| Prop         | Type     | Required | Description                                    |
|--------------|----------|----------|------------------------------------------------|
| `id`         | `number` | Yes      | The unique identifier for the book.            |
| `title`      | `string` | Yes      | The title of the book.                         |
| `author`     | `string` | Yes      | The author of the book.                        |
| `coverImage` | `string` | Yes      | URL for the book's cover image.                |
| `rating`     | `number` | Yes      | The book's numerical rating (e.g., 4.5).       |
| `price`      | `number` | Yes      | The price of the book in the base currency unit. |
| `genre`      | `string` | Yes      | The literary genre of the book.                |

### Type Definition

```typescript
interface BookCardProps {
  id: number;
  title: string;
  author: string;
  coverImage: string;
  rating: number;
  price: number;
  genre: string;
}
```

## How It Works

The `BookCard` component is a stateless functional component built with Chakra UI. It receives all necessary data via the `BookCardProps` interface and renders it within a styled `Box` container.

1.  **Data Reception**: The component accepts a single `props` object containing the book's details.
2.  **Price Formatting**: It utilizes an internal `formatPrice` function to convert the numeric `price` prop into a localized currency string (INR, `₹`).
3.  **Layout**: The structure is composed of Chakra UI components (`Box`, `Image`, `Text`, `Badge`, `Flex`). A hover effect (`_hover={{ transform: 'scale(1.02)' }}`) provides minor visual feedback.
4.  **Interactions**: It includes 'Favorite' (`FaHeart`) and 'Add to Cart' buttons. The `onClick` handlers for these buttons are currently stubbed as empty functions (`onClick={() => {}}`). Event handling logic (e.g., adding to cart, favoriting a book) must be implemented by the parent component by extending this component or wrapping it.

## Integration Steps

To use `BookCard` within a parent component (e.g., a book listing page):

1.  **Import**: Import the `BookCard` component.
2.  **Instantiate**: Render the component, passing the required book data as props. Ensure the data structure matches the `BookCardProps` interface.

```tsx
// src/pages/BooksPage.tsx
import React from 'react';
import { SimpleGrid } from '@chakra-ui/react';
import BookCard from '../components/BookCard';
import { books } from '../data/booksData'; // Example data source

const BooksPage = () => {
  return (
    <SimpleGrid columns={{ sm: 1, md: 2, lg: 4 }} spacing={8} p={5}>
      {books.map((book) => (
        <BookCard key={book.id} {...book} />
      ))}
    </SimpleGrid>
  );
};

export default BooksPage;
```

## Error Handling and Edge Cases

-   **Data Integrity**: The component expects all props to be valid and correctly typed. Missing or invalid props (e.g., a broken `coverImage` URL) will lead to rendering errors or visual defects. Type safety is enforced by TypeScript.
-   **Interactivity**: The 'Favorite' and 'Add to Cart' buttons are non-functional by default. The parent component is responsible for implementing the logic for these actions, likely via callbacks passed as props (which would require modifying the component's API).
-   **Theming Dependencies**: The component uses custom theme tokens (`color="fun.pink"`, `variant="fun"`). It requires the application's Chakra UI Provider to be configured with the custom [theme](09_theme.md) for correct visual rendering. Without it, these styles will fail to apply.

## Examples

### Basic Usage

A minimal example rendering a single `BookCard` with sample data. This assumes a parent `ChakraProvider` is configured with the application's custom theme.

```tsx
import React from 'react';
import { ChakraProvider, Box } from '@chakra-ui/react';
import BookCard from './BookCard';
import { theme } from '../theme'; // Custom theme import

const BookCardExample = () => {
  const sampleBook = {
    id: 101,
    title: 'Atomic Habits',
    author: 'James Clear',
    coverImage: 'https://images-na.ssl-images-amazon.com/images/I/81wgcld4wxL.jpg',
    rating: 4.8,
    price: 750,
    genre: 'Self-Help',
  };

  return (
    <ChakraProvider theme={theme}>
      <Box p={5} maxW="320px">
        <BookCard {...sampleBook} />
      </Box>
    </ChakraProvider>
  );
};

export default BookCardExample;
```

## Related Components

-   **[Books](05_books.md)**: This component serves as a primary container for rendering a grid of `BookCard` components.
-   **[Search](06_search.md)**: Search results are typically rendered using a list of `BookCard` components.
-   **[Cart](07_cart.md)**: The "Add to Cart" button's functionality is directly related to the application's cart state management.
-   **[theme](09_theme.md)**: Defines custom styles (`fun.pink`, `variant="fun"`) that `BookCard` depends on.
-   **[formatPrice](10_formatprice.md)**: While `BookCard` has an internal formatter, it relates to the global price formatting strategy.

## File References

-   `src/components/BookCard.tsx`

---

Generated by [AI Codebase Knowledge Builder](https://github.com/The-Pocket/Tutorial-Codebase-Knowledge)