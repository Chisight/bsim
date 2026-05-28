TARGET       = ../js/wasm-bin/engine.wasm
TARGET_SHARED = ../js/wasm-bin/engine_shared.wasm
SRC          = src/engine.wat
SRC_SHARED   = src/engine_shared.wat

all: $(TARGET) $(TARGET_SHARED)

$(TARGET): $(SRC)
	mkdir -p $(dir $(TARGET))
	wat2wasm $(SRC) -o $(TARGET)

$(TARGET_SHARED): $(SRC_SHARED)
	mkdir -p $(dir $(TARGET_SHARED))
	wat2wasm --enable-threads $(SRC_SHARED) -o $(TARGET_SHARED)

clean:
	rm -f $(TARGET) $(TARGET_SHARED)
