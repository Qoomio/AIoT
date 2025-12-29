# Test Markdown File

This is a comprehensive test markdown file for the renderer applet. It contains various markdown elements to test the rendering functionality.

## Headers

### Level 3 Header
#### Level 4 Header (not parsed by renderer)
##### Level 5 Header (not parsed by renderer)

## Text Formatting

This paragraph contains **bold text** and *italic text* for testing text formatting.

You can also have `inline code` within paragraphs.

## Code Blocks

Here's a JavaScript code block:

```javascript
function testFunction() {
    console.log("Hello, World!");
    return true;
}
```

Here's a Python code block:

```python
def test_function():
    print("Hello, World!")
    return True
```

## Lists

Here are some list items:

* First item
* Second item
* Third item
* Fourth item with **bold** and *italic* text
* Fifth item with `inline code`

## Mixed Content

This section tests mixed content with various elements:

* **Bold list item** with some regular text
* List item with `inline code block`
* *Italic list item* for emphasis

## Special Characters

Testing special characters that need escaping:
- Ampersand: &
- Less than: <
- Greater than: >
- Quotes: "double" and 'single'

## More Complex Examples

This paragraph has **bold with `code inside`** and *italic with `code inside`*.

```html
<div class="test">
    <p>HTML code block test</p>
    <span>With special characters: &lt; &gt; &amp;</span>
</div>
```

## Edge Cases

* Item with trailing spaces   
* Item with **bold** and *italic* and `code`
* Item with multiple `code` blocks in `one` line

Testing **bold with *italic inside*** and *italic with **bold inside***.

## Performance Test

This is a longer paragraph to test performance with more content. It contains various formatting elements distributed throughout the text. Some words are **bold**, others are *italic*, and there are `inline code` segments. This helps ensure the renderer can handle documents with mixed content efficiently.

## Final Test

End of test file with a final code block:

```
Plain text code block
No syntax highlighting
Multiple lines
    With indentation
        And more indentation
```

That's the end of the test markdown file! 