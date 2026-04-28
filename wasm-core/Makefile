TARGET = ../js/wasm-bin/engine.wasm
SRC = src/engine.wat

all: $(TARGET)

$(TARGET): $(SRC)
	wat2wasm $(SRC) -o $(TARGET)

clean:
	rm -f $(TARGET)
