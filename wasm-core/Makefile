TARGET = ../js/wasm-bin/engine.wasm
SRC = src/engine.wat

all: $(TARGET)

$(TARGET): $(SRC)
	mkdir -p $(dir $(TARGET))
	wat2wasm $(SRC) -o $(TARGET)

clean:
	rm -f $(TARGET)
