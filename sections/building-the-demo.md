[:arrow_backward:](setup.md)
[:arrow_double_up:](../README.md)
[:arrow_up_small:](#)
[:arrow_down_small:](#copyright)
[:arrow_forward:](running-the-demo.md)

# 3D Game Shaders For Beginners

## Building The Demo

<p align="center">
<img src="https://i.imgur.com/PQcDnIu.gif" alt="Building The Demo" title="Building The Demo">
</p>

Before you can try out the demo program, you'll have to build the example code first.

### Dependencies

Before you can compile the example code, you'll need to install
[Panda3D](https://www.panda3d.org/)
for your platform.
Panda3D is available for Linux, Mac, and Windows.

### Linux

Start by [installing](https://www.panda3d.org/manual/?title=Installing_Panda3D_in_Linux) the
[Panda3D SDK](https://www.panda3d.org/download/sdk-1-10-9/) for your distribution.

Make sure to locate where the Panda3D headers and libraries are.
The headers and libraries are most likely in `/usr/include/panda3d/` and `/usr/lib/panda3d/` respectively.

Next clone this repository and change directory into it.

```bash
git clone https://github.com/lettier/3d-game-shaders-for-beginners.git
cd 3d-game-shaders-for-beginners/demonstration
```

Now compile the source code into an object file.

```bash
g++ \
  -c src/main.cxx \
  -o 3d-game-shaders-for-beginners.o \
  -std=gnu++11 \
  -O2 \
  -I/path/to/python/include/ \
  -I/path/to/panda3d/include/
```

With the object file created, create the executable by linking the object file to its dependencies.

```bash
g++ \
  3d-game-shaders-for-beginners.o \
  -o 3d-game-shaders-for-beginners \
  -L/path/to/panda3d/lib \
  -lp3framework \
  -lpanda \
  -lpandafx \
  -lpandaexpress \
  -lpandaphysics \
  -lp3dtoolconfig \
  -lp3dtool \
  -lpthread
```

For more help, see the [Panda3D manual](https://www.panda3d.org/manual/?title=How_to_compile_a_C++_Panda3D_program_on_Linux).

### Mac

Install the [Panda3D 1.10.16 SDK](https://www.panda3d.org/download/sdk-1-10-16/) for Mac.
In the installer, select **Customize → C++ Header Files**.
This SDK ships Intel C++ libraries, so Apple Silicon Macs run the demo through Rosetta.
Use Apple Clang from Xcode or the Xcode Command Line Tools.

From the repository root, compile and link the demo:

```bash
cd demonstration
PANDA3D=/Library/Developer/Panda3D

clang++ -arch x86_64 -std=c++11 -O2 \
  -I"$PANDA3D/include" src/main.cxx \
  -L"$PANDA3D/lib" \
  -lp3framework -lpanda -lpandafx -lpandaexpress -lpandaphysics \
  -lp3dtoolconfig -lp3dtool -o 3d-game-shaders-for-beginners
```

Use [the Mac launch command](running-the-demo.md#mac) to run the demo from this directory.

### Windows

Start by [installing](https://www.panda3d.org/manual/?title=Installing_Panda3D_in_Windows) the
[Panda3D SDK](https://www.panda3d.org/download/sdk-1-10-9/) for Windows.

Make sure to locate where the Panda3D headers and libraries are.

Next clone this repository and change directory into it.

```bash
git clone https://github.com/lettier/3d-game-shaders-for-beginners.git
cd 3d-game-shaders-for-beginners
```

For more help, see the [Panda3D manual](https://www.panda3d.org/manual/?title=Running_your_Program&language=cxx).

## Copyright

(C) 2019 David Lettier
<br>
[lettier.com](https://www.lettier.com)

[:arrow_backward:](setup.md)
[:arrow_double_up:](../README.md)
[:arrow_up_small:](#)
[:arrow_down_small:](#copyright)
[:arrow_forward:](running-the-demo.md)
