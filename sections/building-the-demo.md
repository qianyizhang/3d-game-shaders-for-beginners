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

Install the [Panda3D 1.10.16 C++ SDK](https://www.panda3d.org/download/sdk-1-10-16/),
GCC and the Python 3.12 development headers. The build script defaults to the
SDK's Ubuntu 24.04 package layout. For a different layout, set
`P3D_INCLUDE_PATH`, `P3D_LIB_PATH` and `PYTHON_INCLUDE_PATH`.

From the repository root:

```bash
./demonstration/build-for-linux.sh
```

For more help, see the [Panda3D manual](https://www.panda3d.org/manual/?title=How_to_compile_a_C++_Panda3D_program_on_Linux).

### Mac

Install the [Panda3D 1.10.16 SDK](https://www.panda3d.org/download/sdk-1-10-16/) for Mac.
In the installer, select **Customize → C++ Header Files**.
This SDK ships Intel C++ libraries, so Apple Silicon Macs run the demo through Rosetta.
Use Apple Clang from Xcode or the Xcode Command Line Tools.

From the repository root, compile and link the demo:

```bash
./demonstration/macos.sh build
```

Use [the Mac launch command](running-the-demo.md#mac) from the repository root.

### Windows

Start by [installing](https://www.panda3d.org/manual/?title=Installing_Panda3D_in_Windows) the
[Panda3D SDK](https://www.panda3d.org/download/sdk-1-10-9/) for Windows.

Make sure to locate where the Panda3D headers and libraries are.

For the original Windows setup, clone the upstream repository:

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
