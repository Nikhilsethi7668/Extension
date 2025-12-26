# Install necessary packages if not already installed
# install.packages(c("RSelenium", "rvest", "tidyverse"))

library(RSelenium)
library(rvest)
library(tidyverse)

# --- Configuration ---
TARGET_URL <- "https://example.com/cards" # REPLACE THIS with your actual target URL
CARD_SELECTOR <- ".card-item"             # REPLACE THIS with the actual CSS selector for a card container
SEE_MORE_BUTTON_SELECTOR <- "#see-more"   # REPLACE THIS with the actual 'See more results' button selector
# ---------------------

scrape_cards <- function() {
  
  # 1. Ask User for Input
  cat("Enter the maximum number of cards to scrape: ")
  max_cards <- as.integer(readLines("stdin", n = 1))
  
  if (is.na(max_cards) || max_cards <= 0) {
    stop("Invalid input. Please enter a positive integer.")
  }
  
  cat(sprintf("Targeting %d cards...\n", max_cards))
  
  # 2. Setup Selenium Driver
  # Assumes a Selenium server is running (e.g., via Docker) or use rsDriver for local
  # docker run -d -p 4445:4444 selenium/standalone-chrome
  tryCatch({
    remDr <- remoteDriver(remoteServerAddr = "localhost", port = 4545L, browserName = "chrome")
    remDr$open()
  }, error = function(e) {
    stop("Could not connect to Selenium server. Make sure it is running. Error: ", e$message)
  })
  
  on.exit(remDr$close()) # Ensure browser closes on exit
  
  # 3. Navigate to Page
  remDr$navigate(TARGET_URL)
  Sys.sleep(3) # Wait for initial load
  
  # 4. Check Initial Count
  get_card_count <- function() {
    elements <- remDr$findElements(using = "css selector", CARD_SELECTOR)
    return(length(elements))
  }
  
  current_count <- get_card_count()
  cat(sprintf("Initial load: %d cards found.\n", current_count))
  
  # 5. Conditional Logic
  if (current_count >= max_cards) {
    cat("Target reached with initial load. Scraping now...\n")
  } else {
    # Need more cards
    
    # Click "See more results" ONCE
    tryCatch({
      see_more_btn <- remDr$findElement(using = "css selector", SEE_MORE_BUTTON_SELECTOR)
      if (!is.null(see_more_btn)) {
        cat("Clicking 'See more results'...\n")
        see_more_btn$clickElement()
        Sys.sleep(2) # Wait for click action to process
      }
    }, error = function(e) {
      cat("Note: 'See more results' button not found or not clickable. Proceeding to scroll.\n")
    })
    
    # Infinite Scroll Loop
    last_count <- current_count
    no_change_counter <- 0
    MAX_NO_CHANGE_RETRIES <- 3
    
    cat("Entering infinite scroll mode...\n")
    
    while (current_count < max_cards) {
      # Scroll to bottom
      remDr$executeScript("window.scrollTo(0, document.body.scrollHeight);")
      Sys.sleep(2) # Wait for content to load (Adjust depending on connection speed)
      
      current_count <- get_card_count()
      cat(sprintf("Current count: %d\n", current_count))
      
      if (current_count == last_count) {
        no_change_counter <- no_change_counter + 1
        cat(sprintf("No new cards loaded (%d/%d)...\n", no_change_counter, MAX_NO_CHANGE_RETRIES))
        
        if (no_change_counter >= MAX_NO_CHANGE_RETRIES) {
          cat("Stopping: No more content could be loaded.\n")
          break
        }
      } else {
        no_change_counter <- 0 # Reset counter if new cards found
        last_count <- current_count
      }
    }
  }
  
  # 6. Extraction
  cat("Extracting data...\n")
  page_source <- remDr$getPageSource()[[1]]
  page_html <- read_html(page_source)
  
  cards <- page_html %>% html_nodes(CARD_SELECTOR)
  
  # Limit to requested number if we over-fetched
  if (length(cards) > max_cards) {
    cards <- cards[1:max_cards]
  }
  
  # --- Define Extractors Here ---
  # Replace these with actual selectors inside a card
  results <- map_dfr(cards, function(card) {
    title <- card %>% html_node(".card-title") %>% html_text(trim = TRUE)
    price <- card %>% html_node(".card-price") %>% html_text(trim = TRUE)
    
    tibble(
      Title = ifelse(is.na(title), "N/A", title),
      Price = ifelse(is.na(price), "N/A", price)
    )
  })
  
  cat(sprintf("Scraping complete. Collected %d items.\n", nrow(results)))
  return(results)
}

# Run the scraper
# df <- scrape_cards()
# print(df)
